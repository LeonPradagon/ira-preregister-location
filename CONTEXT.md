# Location Verification Context

This context covers customer location checks and their controlled follow-up by the operations team.

## Language

**Verification cycle**

A bounded location-check period containing up to three GPS attempts and up to three reminders. When both limits are exhausted, the cycle requires a human decision or an explicitly authorized new cycle.

_Avoid_: retrying forever or silently resetting an existing session.

**Verification session**

The record of one verification cycle, including its customer, address, attempts, reminders, evidence, and outcome.

**Reminder**

A scheduled follow-up message that lets a customer return to the verification flow. It is not an additional verification cycle.

_Avoid_: treating a reminder as an extra attempt outside the cycle limits.

**System follow-up reminder**

A system-generated reminder for an active verification that has had no customer activity for the configured inactivity window. It continues the current customer action, such as updating an address or capturing GPS, and consumes one reminder within the same verification cycle.

_Avoid_: sending follow-ups for completed, expired, opted-out, or already scheduled sessions, or changing the customer’s verification state merely because a reminder was sent.
