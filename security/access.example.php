<?php
// Copy OUTSIDE the web root to /home/simpxlow/kirkstone-private/access.php.
// Keep disabled until staging checks and deployment approval. File mode 0600.
return [
    'enabled'=>false,
    'origin'=>'https://quotes.kirkstonecalibration.co.uk',
    'projectId'=>'kirkstone-calibration',
    'serviceAccountFile'=>'/home/simpxlow/kirkstone-private/service-account.json',
    'bridgeVersion'=>1,
    'users'=>[
        'Danwalters'=>['role'=>'owner','enabled'=>true],
        'ShelleyCoates'=>['role'=>'employee','enabled'=>false],
    ],
];
