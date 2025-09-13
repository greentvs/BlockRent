(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PROPERTY-ID u101)
(define-constant ERR-INVALID-TENANT u102)
(define-constant ERR-INVALID-START-DATE u103)
(define-constant ERR-INVALID-END-DATE u104)
(define-constant ERR-INVALID-RENTAL-AMOUNT u105)
(define-constant ERR-BOOKING-ALREADY-EXISTS u106)
(define-constant ERR-BOOKING-NOT-FOUND u107)
(define-constant ERR-INVALID-STATUS u108)
(define-constant ERR-PROPERTY-NOT-AVAILABLE u109)
(define-constant ERR-INSUFFICIENT-DEPOSIT u110)
(define-constant ERR-DISPUTE-IN-PROGRESS u111)
(define-constant ERR-INVALID-CHECKIN-TIME u112)
(define-constant ERR-INVALID-CHECKOUT-TIME u113)
(define-constant ERR-NOT-VERIFIED-TENANT u114)
(define-constant ERR-ESCROW-FAILURE u115)
(define-constant ERR-REPUTATION-CHECK-FAILED u116)
(define-constant ERR-INVALID-CANCELLATION-POLICY u117)
(define-constant ERR-INVALID-GUEST-COUNT u118)
(define-constant ERR-INVALID-LOCATION-HASH u119)
(define-constant ERR-MAX-BOOKINGS-EXCEEDED u120)

(define-data-var next-booking-id uint u0)
(define-data-var max-bookings uint u10000)
(define-data-var booking-fee uint u500)
(define-data-var property-registry-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var identity-verification-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var payment-escrow-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var reputation-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var dispute-arbitration-contract principal 'SP000000000000000000002Q6VF78)

(define-map bookings
  uint
  {
    property-id: uint,
    tenant: principal,
    landlord: principal,
    start-date: uint,
    end-date: uint,
    rental-amount: uint,
    deposit-amount: uint,
    status: (string-ascii 20),
    checkin-time: (optional uint),
    checkout-time: (optional uint),
    guest-count: uint,
    location-hash: (buff 32),
    cancellation-policy: (string-ascii 50),
    timestamp: uint
  }
)

(define-map bookings-by-property
  uint
  (list 100 uint))

(define-map booking-updates
  uint
  {
    update-status: (string-ascii 20),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-booking (id uint))
  (map-get? bookings id)
)

(define-read-only (get-booking-updates (id uint))
  (map-get? booking-updates id)
)

(define-read-only (get-bookings-for-property (property-id uint))
  (default-to (list) (map-get? bookings-by-property property-id))
)

(define-private (validate-property-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-PROPERTY-ID))
)

(define-private (validate-tenant (tenant principal))
  (if (not (is-eq tenant tx-sender))
      (ok true)
      (err ERR-INVALID-TENANT))
)

(define-private (validate-start-date (start uint))
  (if (> start block-height)
      (ok true)
      (err ERR-INVALID-START-DATE))
)

(define-private (validate-end-date (start uint) (end uint))
  (if (> end start)
      (ok true)
      (err ERR-INVALID-END-DATE))
)

(define-private (validate-rental-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-RENTAL-AMOUNT))
)

(define-private (validate-deposit-amount (deposit uint) (rental uint))
  (if (>= deposit (/ rental u2))
      (ok true)
      (err ERR-INSUFFICIENT-DEPOSIT))
)

(define-private (validate-status (status (string-ascii 20)))
  (if (or (is-eq status "pending") (is-eq status "confirmed") (is-eq status "active") (is-eq status "completed") (is-eq status "cancelled") (is-eq status "disputed"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-guest-count (count uint))
  (if (and (> count u0) (<= count u20))
      (ok true)
      (err ERR-INVALID-GUEST-COUNT))
)

(define-private (validate-location-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-LOCATION-HASH))
)

(define-private (validate-cancellation-policy (policy (string-ascii 50)))
  (if (or (is-eq policy "flexible") (is-eq policy "moderate") (is-eq policy "strict"))
      (ok true)
      (err ERR-INVALID-CANCELLATION-POLICY))
)

(define-private (check-property-availability (property-id uint) (start uint) (end uint))
  (let ((existing-bookings (get-bookings-for-property property-id)))
    (fold check-overlap existing-bookings (ok true))
  )
)

(define-private (check-overlap (booking-id uint) (acc (response bool uint)))
  (match acc
    ok-val
      (let ((booking (unwrap-panic (get-booking booking-id))))
        (if (and (is-eq (get status booking) "confirmed")
                 (or (and (>= start (get start-date booking)) (< start (get end-date booking)))
                     (and (>= end (get start-date booking)) (< end (get end-date booking)))
                     (and (< start (get start-date booking)) (> end (get end-date booking)))))
            (err ERR-PROPERTY-NOT-AVAILABLE)
            (ok true)
        )
      )
    err-val acc
  )
)

(define-private (check-tenant-verification (tenant principal))
  (contract-call? .identity-verification-contract is-verified tenant)
)

(define-private (check-tenant-reputation (tenant principal))
  (let ((rep (unwrap-panic (contract-call? .reputation-contract get-reputation-score tenant))))
    (if (>= rep u50)
        (ok true)
        (err ERR-REPUTATION-CHECK-FAILED))
  )
)

(define-public (create-booking
  (property-id uint)
  (start-date uint)
  (end-date uint)
  (rental-amount uint)
  (deposit-amount uint)
  (guest-count uint)
  (location-hash (buff 32))
  (cancellation-policy (string-ascii 50))
)
  (let (
        (next-id (var-get next-booking-id))
        (current-max (var-get max-bookings))
        (landlord (unwrap-panic (contract-call? .property-registry-contract get-property-owner property-id)))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-BOOKINGS-EXCEEDED))
    (try! (validate-property-id property-id))
    (try! (validate-start-date start-date))
    (try! (validate-end-date start-date end-date))
    (try! (validate-rental-amount rental-amount))
    (try! (validate-deposit-amount deposit-amount rental-amount))
    (try! (validate-guest-count guest-count))
    (try! (validate-location-hash location-hash))
    (try! (validate-cancellation-policy cancellation-policy))
    (try! (check-property-availability property-id start-date end-date))
    (try! (check-tenant-verification tx-sender))
    (try! (check-tenant-reputation tx-sender))
    (try! (contract-call? .payment-escrow-contract deposit-funds next-id (+ rental-amount deposit-amount)))
    (map-set bookings next-id
      {
        property-id: property-id,
        tenant: tx-sender,
        landlord: landlord,
        start-date: start-date,
        end-date: end-date,
        rental-amount: rental-amount,
        deposit-amount: deposit-amount,
        status: "pending",
        checkin-time: none,
        checkout-time: none,
        guest-count: guest-count,
        location-hash: location-hash,
        cancellation-policy: cancellation-policy,
        timestamp: block-height
      }
    )
    (map-set bookings-by-property property-id
      (append (get-bookings-for-property property-id) next-id))
    (var-set next-booking-id (+ next-id u1))
    (print { event: "booking-created", id: next-id })
    (ok next-id)
  )
)

(define-public (confirm-booking (booking-id uint))
  (let ((booking (unwrap! (map-get? bookings booking-id) (err ERR-BOOKING-NOT-FOUND))))
    (asserts! (is-eq (get landlord booking) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status booking) "pending") (err ERR-INVALID-STATUS))
    (map-set bookings booking-id (merge booking { status: "confirmed" }))
    (map-set booking-updates booking-id
      {
        update-status: "confirmed",
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (print { event: "booking-confirmed", id: booking-id })
    (ok true)
  )
)

(define-public (check-in (booking-id uint))
  (let ((booking (unwrap! (map-get? bookings booking-id) (err ERR-BOOKING-NOT-FOUND))))
    (asserts! (is-eq (get tenant booking) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status booking) "confirmed") (err ERR-INVALID-STATUS))
    (asserts! (>= block-height (get start-date booking)) (err ERR-INVALID-CHECKIN-TIME))
    (map-set bookings booking-id (merge booking { status: "active", checkin-time: (some block-height) }))
    (map-set booking-updates booking-id
      {
        update-status: "active",
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (try! (contract-call? .payment-escrow-contract release-to-landlord booking-id (get rental-amount booking)))
    (print { event: "check-in", id: booking-id })
    (ok true)
  )
)

(define-public (check-out (booking-id uint))
  (let ((booking (unwrap! (map-get? bookings booking-id) (err ERR-BOOKING-NOT-FOUND))))
    (asserts! (or (is-eq (get tenant booking) tx-sender) (is-eq (get landlord booking) tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status booking) "active") (err ERR-INVALID-STATUS))
    (asserts! (>= block-height (get end-date booking)) (err ERR-INVALID-CHECKOUT-TIME))
    (map-set bookings booking-id (merge booking { status: "completed", checkout-time: (some block-height) }))
    (map-set booking-updates booking-id
      {
        update-status: "completed",
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (try! (contract-call? .payment-escrow-contract release-deposit booking-id (get tenant booking)))
    (print { event: "check-out", id: booking-id })
    (ok true)
  )
)

(define-public (cancel-booking (booking-id uint))
  (let ((booking (unwrap! (map-get? bookings booking-id) (err ERR-BOOKING-NOT-FOUND))))
    (asserts! (or (is-eq (get tenant booking) tx-sender) (is-eq (get landlord booking) tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (or (is-eq (get status booking) "pending") (is-eq (get status booking) "confirmed")) (err ERR-INVALID-STATUS))
    (asserts! (> (get start-date booking) (+ block-height u48)) (err ERR-INVALID-CANCELLATION-POLICY))
    (map-set bookings booking-id (merge booking { status: "cancelled" }))
    (map-set booking-updates booking-id
      {
        update-status: "cancelled",
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (try! (contract-call? .payment-escrow-contract refund booking-id (get tenant booking)))
    (print { event: "booking-cancelled", id: booking-id })
    (ok true)
  )
)

(define-public (initiate-dispute (booking-id uint))
  (let ((booking (unwrap! (map-get? bookings booking-id) (err ERR-BOOKING-NOT-FOUND))))
    (asserts! (or (is-eq (get tenant booking) tx-sender) (is-eq (get landlord booking) tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status booking) "active") (err ERR-INVALID-STATUS))
    (map-set bookings booking-id (merge booking { status: "disputed" }))
    (map-set booking-updates booking-id
      {
        update-status: "disputed",
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (try! (contract-call? .dispute-arbitration-contract start-dispute booking-id tx-sender))
    (print { event: "dispute-initiated", id: booking-id })
    (ok true)
  )
)

(define-public (get-booking-count)
  (ok (var-get next-booking-id))
)