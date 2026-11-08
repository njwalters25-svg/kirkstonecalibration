<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/server/firebase-bridge.php';
kc_headers();
try {
    $config=kc_config();$identity=kc_identity($config);
    if(($config['users'][$identity]['role'] ?? '')!=='owner'){http_response_code(403);throw new RuntimeException('Access denied');}
    kc_session($identity);
    if($_SERVER['REQUEST_METHOD']==='GET') {echo json_encode(['csrf'=>$_SESSION['csrf']]);exit;}
    kc_post($config);
    $key=kc_key($config);$now=time();
    $claims=['iss'=>$key['client_email'],'sub'=>$key['client_email'],
        'aud'=>'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        'iat'=>$now,'exp'=>$now+300,'uid'=>'cpanel-owner','claims'=>['role'=>'owner','bridgeVersion'=>$config['bridgeVersion']]];
    echo json_encode(['token'=>kc_jwt($claims,$key)]);
} catch(Throwable $error){kc_fail($error);}
