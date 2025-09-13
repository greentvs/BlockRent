import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PROPERTY_ID = 101;
const ERR_INVALID_START_DATE = 103;
const ERR_INVALID_END_DATE = 104;
const ERR_INVALID_RENTAL_AMOUNT = 105;
const ERR_BOOKING_ALREADY_EXISTS = 106;
const ERR_BOOKING_NOT_FOUND = 107;
const ERR_INVALID_STATUS = 108;
const ERR_PROPERTY_NOT_AVAILABLE = 109;
const ERR_INSUFFICIENT_DEPOSIT = 110;
const ERR_NOT_VERIFIED_TENANT = 114;
const ERR_REPUTATION_CHECK_FAILED = 116;
const ERR_INVALID_CANCELLATION_POLICY = 117;
const ERR_INVALID_GUEST_COUNT = 118;
const ERR_INVALID_LOCATION_HASH = 119;
const ERR_MAX_BOOKINGS_EXCEEDED = 120;
const ERR_INVALID_CHECKIN_TIME = 112;
const ERR_INVALID_CHECKOUT_TIME = 113;

interface Booking {
  propertyId: number;
  tenant: string;
  landlord: string;
  startDate: number;
  endDate: number;
  rentalAmount: number;
  depositAmount: number;
  status: string;
  checkinTime: number | null;
  checkoutTime: number | null;
  guestCount: number;
  locationHash: Uint8Array;
  cancellationPolicy: string;
  timestamp: number;
}

interface BookingUpdate {
  updateStatus: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class BookingContractMock {
  state: {
    nextBookingId: number;
    maxBookings: number;
    bookingFee: number;
    bookings: Map<number, Booking>;
    bookingsByProperty: Map<number, number[]>;
    bookingUpdates: Map<number, BookingUpdate>;
  } = {
    nextBookingId: 0,
    maxBookings: 10000,
    bookingFee: 500,
    bookings: new Map(),
    bookingsByProperty: new Map(),
    bookingUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TENANT";
  propertyOwners: Map<number, string> = new Map([[1, "ST2LANDLORD"]]);
  verifiedTenants: Set<string> = new Set(["ST1TENANT"]);
  reputationScores: Map<string, number> = new Map([["ST1TENANT", 80]]);
  escrowDeposits: Map<number, number> = new Map();
  escrowReleases: Array<{ id: number; amount: number; to: string }> = [];
  disputes: Set<number> = new Set();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextBookingId: 0,
      maxBookings: 10000,
      bookingFee: 500,
      bookings: new Map(),
      bookingsByProperty: new Map(),
      bookingUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TENANT";
    this.propertyOwners.set(1, "ST2LANDLORD");
    this.verifiedTenants = new Set(["ST1TENANT"]);
    this.reputationScores.set("ST1TENANT", 80);
    this.escrowDeposits = new Map();
    this.escrowReleases = [];
    this.disputes = new Set();
  }

  getPropertyOwner(propertyId: number): Result<string> {
    const owner = this.propertyOwners.get(propertyId);
    return owner ? { ok: true, value: owner } : { ok: false, value: "" };
  }

  isVerified(tenant: string): Result<boolean> {
    return { ok: true, value: this.verifiedTenants.has(tenant) };
  }

  getReputationScore(tenant: string): Result<number> {
    const score = this.reputationScores.get(tenant) ?? 0;
    return { ok: true, value: score };
  }

  depositFunds(id: number, amount: number): Result<boolean> {
    this.escrowDeposits.set(id, amount);
    return { ok: true, value: true };
  }

  releaseToLandlord(id: number, amount: number): Result<boolean> {
    this.escrowReleases.push({ id, amount, to: "landlord" });
    return { ok: true, value: true };
  }

  releaseDeposit(id: number, to: string): Result<boolean> {
    this.escrowReleases.push({ id, amount: 0, to });
    return { ok: true, value: true };
  }

  refund(id: number, to: string): Result<boolean> {
    this.escrowReleases.push({ id, amount: 0, to });
    return { ok: true, value: true };
  }

  startDispute(id: number, initiator: string): Result<boolean> {
    this.disputes.add(id);
    return { ok: true, value: true };
  }

  createBooking(
    propertyId: number,
    startDate: number,
    endDate: number,
    rentalAmount: number,
    depositAmount: number,
    guestCount: number,
    locationHash: Uint8Array,
    cancellationPolicy: string
  ): Result<number> {
    if (this.state.nextBookingId >= this.state.maxBookings) return { ok: false, value: ERR_MAX_BOOKINGS_EXCEEDED };
    if (propertyId <= 0) return { ok: false, value: ERR_INVALID_PROPERTY_ID };
    if (startDate <= this.blockHeight) return { ok: false, value: ERR_INVALID_START_DATE };
    if (endDate <= startDate) return { ok: false, value: ERR_INVALID_END_DATE };
    if (rentalAmount <= 0) return { ok: false, value: ERR_INVALID_RENTAL_AMOUNT };
    if (depositAmount < rentalAmount / 2) return { ok: false, value: ERR_INSUFFICIENT_DEPOSIT };
    if (guestCount <= 0 || guestCount > 20) return { ok: false, value: ERR_INVALID_GUEST_COUNT };
    if (locationHash.length !== 32) return { ok: false, value: ERR_INVALID_LOCATION_HASH };
    if (!["flexible", "moderate", "strict"].includes(cancellationPolicy)) return { ok: false, value: ERR_INVALID_CANCELLATION_POLICY };
    if (!this.isVerified(this.caller).value) return { ok: false, value: ERR_NOT_VERIFIED_TENANT };
    if (this.getReputationScore(this.caller).value < 50) return { ok: false, value: ERR_REPUTATION_CHECK_FAILED };
    const existing = this.state.bookingsByProperty.get(propertyId) ?? [];
    for (const bid of existing) {
      const b = this.state.bookings.get(bid);
      if (b && b.status === "confirmed" &&
          ((startDate >= b.startDate && startDate < b.endDate) ||
           (endDate > b.startDate && endDate <= b.endDate) ||
           (startDate < b.startDate && endDate > b.endDate))) {
        return { ok: false, value: ERR_PROPERTY_NOT_AVAILABLE };
      }
    }
    const landlord = this.getPropertyOwner(propertyId).value;
    if (!landlord) return { ok: false, value: ERR_INVALID_PROPERTY_ID };
    this.depositFunds(this.state.nextBookingId, rentalAmount + depositAmount);
    const id = this.state.nextBookingId;
    const booking: Booking = {
      propertyId,
      tenant: this.caller,
      landlord,
      startDate,
      endDate,
      rentalAmount,
      depositAmount,
      status: "pending",
      checkinTime: null,
      checkoutTime: null,
      guestCount,
      locationHash,
      cancellationPolicy,
      timestamp: this.blockHeight,
    };
    this.state.bookings.set(id, booking);
    const propBookings = this.state.bookingsByProperty.get(propertyId) ?? [];
    propBookings.push(id);
    this.state.bookingsByProperty.set(propertyId, propBookings);
    this.state.nextBookingId++;
    return { ok: true, value: id };
  }

  confirmBooking(id: number): Result<boolean> {
    const booking = this.state.bookings.get(id);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (booking.landlord !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (booking.status !== "pending") return { ok: false, value: ERR_INVALID_STATUS };
    booking.status = "confirmed";
    this.state.bookings.set(id, booking);
    this.state.bookingUpdates.set(id, {
      updateStatus: "confirmed",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  checkIn(id: number): Result<boolean> {
    const booking = this.state.bookings.get(id);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (booking.tenant !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (booking.status !== "confirmed") return { ok: false, value: ERR_INVALID_STATUS };
    if (this.blockHeight < booking.startDate) return { ok: false, value: ERR_INVALID_CHECKIN_TIME };
    booking.status = "active";
    booking.checkinTime = this.blockHeight;
    this.state.bookings.set(id, booking);
    this.state.bookingUpdates.set(id, {
      updateStatus: "active",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.releaseToLandlord(id, booking.rentalAmount);
    return { ok: true, value: true };
  }

  checkOut(id: number): Result<boolean> {
    const booking = this.state.bookings.get(id);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (booking.tenant !== this.caller && booking.landlord !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (booking.status !== "active") return { ok: false, value: ERR_INVALID_STATUS };
    if (this.blockHeight < booking.endDate) return { ok: false, value: ERR_INVALID_CHECKOUT_TIME };
    booking.status = "completed";
    booking.checkoutTime = this.blockHeight;
    this.state.bookings.set(id, booking);
    this.state.bookingUpdates.set(id, {
      updateStatus: "completed",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.releaseDeposit(id, booking.tenant);
    return { ok: true, value: true };
  }

  cancelBooking(id: number): Result<boolean> {
    const booking = this.state.bookings.get(id);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (booking.tenant !== this.caller && booking.landlord !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (booking.status !== "pending" && booking.status !== "confirmed") return { ok: false, value: ERR_INVALID_STATUS };
    if (booking.startDate <= this.blockHeight + 48) return { ok: false, value: ERR_INVALID_CANCELLATION_POLICY };
    booking.status = "cancelled";
    this.state.bookings.set(id, booking);
    this.state.bookingUpdates.set(id, {
      updateStatus: "cancelled",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.refund(id, booking.tenant);
    return { ok: true, value: true };
  }

  initiateDispute(id: number): Result<boolean> {
    const booking = this.state.bookings.get(id);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (booking.tenant !== this.caller && booking.landlord !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (booking.status !== "active") return { ok: false, value: ERR_INVALID_STATUS };
    booking.status = "disputed";
    this.state.bookings.set(id, booking);
    this.state.bookingUpdates.set(id, {
      updateStatus: "disputed",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.startDispute(id, this.caller);
    return { ok: true, value: true };
  }

  getBookingCount(): Result<number> {
    return { ok: true, value: this.state.nextBookingId };
  }
}

describe("BookingContract", () => {
  let contract: BookingContractMock;

  beforeEach(() => {
    contract = new BookingContractMock();
    contract.reset();
  });

  it("creates a booking successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const booking = contract.state.bookings.get(0);
    expect(booking?.propertyId).toBe(1);
    expect(booking?.tenant).toBe("ST1TENANT");
    expect(booking?.landlord).toBe("ST2LANDLORD");
    expect(booking?.startDate).toBe(100);
    expect(booking?.endDate).toBe(200);
    expect(booking?.rentalAmount).toBe(1000);
    expect(booking?.depositAmount).toBe(600);
    expect(booking?.status).toBe("pending");
    expect(booking?.guestCount).toBe(4);
    expect(booking?.cancellationPolicy).toBe("moderate");
    expect(contract.escrowDeposits.get(0)).toBe(1600);
  });

  it("rejects booking with invalid property ID", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(0, 100, 200, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPERTY_ID);
  });

  it("rejects booking with past start date", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.blockHeight = 150;
    const result = contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_START_DATE);
  });

  it("rejects booking with end before start", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(1, 200, 100, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_END_DATE);
  });

  it("rejects booking with zero rental amount", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(1, 100, 200, 0, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RENTAL_AMOUNT);
  });

  it("rejects booking with insufficient deposit", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(1, 100, 200, 1000, 400, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_DEPOSIT);
  });

  it("rejects booking with invalid guest count", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(1, 100, 200, 1000, 600, 0, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_GUEST_COUNT);
  });

  it("rejects booking with invalid location hash", () => {
    const hash = new Uint8Array(31).fill(0);
    const result = contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION_HASH);
  });

  it("rejects booking with invalid cancellation policy", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CANCELLATION_POLICY);
  });

  it("rejects unverified tenant", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.verifiedTenants.clear();
    const result = contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_VERIFIED_TENANT);
  });

  it("rejects low reputation tenant", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.reputationScores.set("ST1TENANT", 40);
    const result = contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REPUTATION_CHECK_FAILED);
  });

  it("rejects overlapping booking", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    contract.caller = "ST1TENANT";
    const result = contract.createBooking(1, 150, 250, 1000, 600, 4, hash, "moderate");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPERTY_NOT_AVAILABLE);
  });

  it("confirms booking successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    const result = contract.confirmBooking(0);
    expect(result.ok).toBe(true);
    const booking = contract.state.bookings.get(0);
    expect(booking?.status).toBe("confirmed");
    const update = contract.state.bookingUpdates.get(0);
    expect(update?.updateStatus).toBe("confirmed");
  });

  it("rejects confirm by non-landlord", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    const result = contract.confirmBooking(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects confirm on non-pending", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    const result = contract.confirmBooking(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("checks in successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    contract.caller = "ST1TENANT";
    contract.blockHeight = 100;
    const result = contract.checkIn(0);
    expect(result.ok).toBe(true);
    const booking = contract.state.bookings.get(0);
    expect(booking?.status).toBe("active");
    expect(booking?.checkinTime).toBe(100);
    expect(contract.escrowReleases).toEqual([{ id: 0, amount: 1000, to: "landlord" }]);
  });

  it("rejects check-in before start", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    contract.caller = "ST1TENANT";
    contract.blockHeight = 99;
    const result = contract.checkIn(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CHECKIN_TIME);
  });

  it("checks out successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    contract.caller = "ST1TENANT";
    contract.blockHeight = 100;
    contract.checkIn(0);
    contract.blockHeight = 200;
    const result = contract.checkOut(0);
    expect(result.ok).toBe(true);
    const booking = contract.state.bookings.get(0);
    expect(booking?.status).toBe("completed");
    expect(booking?.checkoutTime).toBe(200);
    expect(contract.escrowReleases[1]).toEqual({ id: 0, amount: 0, to: "ST1TENANT" });
  });

  it("rejects check-out before end", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    contract.caller = "ST1TENANT";
    contract.blockHeight = 100;
    contract.checkIn(0);
    contract.blockHeight = 199;
    const result = contract.checkOut(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CHECKOUT_TIME);
  });

  it("cancels booking successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.blockHeight = 50;
    const result = contract.cancelBooking(0);
    expect(result.ok).toBe(true);
    const booking = contract.state.bookings.get(0);
    expect(booking?.status).toBe("cancelled");
    expect(contract.escrowReleases).toEqual([{ id: 0, amount: 0, to: "ST1TENANT" }]);
  });

  it("rejects cancel close to start", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.blockHeight = 53;
    const result = contract.cancelBooking(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CANCELLATION_POLICY);
  });

  it("initiates dispute successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.caller = "ST2LANDLORD";
    contract.confirmBooking(0);
    contract.caller = "ST1TENANT";
    contract.blockHeight = 100;
    contract.checkIn(0);
    const result = contract.initiateDispute(0);
    expect(result.ok).toBe(true);
    const booking = contract.state.bookings.get(0);
    expect(booking?.status).toBe("disputed");
    expect(contract.disputes.has(0)).toBe(true);
  });

  it("rejects dispute on non-active", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    const result = contract.initiateDispute(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("returns correct booking count", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    contract.createBooking(1, 300, 400, 1500, 800, 5, hash, "strict");
    const result = contract.getBookingCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("parses booking parameters with Clarity types", () => {
    const propId = uintCV(1);
    const start = uintCV(100);
    expect(propId.value).toEqual(BigInt(1));
    expect(start.value).toEqual(BigInt(100));
  });

  it("rejects max bookings exceeded", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.state.maxBookings = 1;
    contract.createBooking(1, 100, 200, 1000, 600, 4, hash, "moderate");
    const result = contract.createBooking(1, 300, 400, 1500, 800, 5, hash, "strict");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_BOOKINGS_EXCEEDED);
  });
});