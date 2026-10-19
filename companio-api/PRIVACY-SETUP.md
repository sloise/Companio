# Privacy notice configuration

The configured organization is Companio and the privacy contact is privacy@companio.com. These defaults can be overridden in the API environment; clear/rebuild Laravel configuration cache after changes:

- PRIVACY_CONTROLLER: legal name of the shelter responsible for the data.
- PRIVACY_CONTACT: monitored privacy contact and contact instructions.
- PRIVACY_RETENTION: approved periods for IDs, photos, co-signer details and application records, with the starting event and disposal method.

The retention default reflects the periods supplied by the project owner. Confirm these with the shelter. New applications are blocked until the controller and contact values exist. This change records consent and displays the configured policy; it does not implement a deletion scheduler. The shelter must establish disposal procedures that match its published policy. Update privacy.version in config/privacy.php when changing the notice. Consent timestamps, versions and the policy snapshot are stored in the application's screening JSON. Old applications are not assigned retroactive consent.

Sources: https://privacy.gov.ph/the-right-to-be-informed/ and https://privacy.gov.ph/data-privacy-act-/
