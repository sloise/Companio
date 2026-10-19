<?php

return [
    'controller' => env('PRIVACY_CONTROLLER', 'Companio'),
    'contact' => env('PRIVACY_CONTACT', 'privacy@companio.com'),
    // State the actual period, its starting event, and disposal method.
    'retention' => env('PRIVACY_RETENTION', 'Government IDs, including co-signer IDs: delete after the screening decision, or after 30 days if the application is withdrawn; retain only a record of the ID check and staff reviewer. Home photos: retain while the volunteer is active or a placement is ongoing, then delete within one year after the last placement ends or the application closes. Co-signer details and application records: retain for one year after the application closes, then delete or anonymize.'),
    'version' => '2026-10-19',
];
