<?php
declare(strict_types=1);
require_once __DIR__.'/access-policy.php';

function kc_config(): array {
    // This private file must be provisioned separately; never commit a service-account key.
    $file=getenv('KIRKSTONE_ACCESS_CONFIG') ?: '/home/simpxlow/kirkstone-private/access.php';
    if (!is_file($file)) throw new RuntimeException('Access service not configured');
    $config=require $file;
    if (!is_array($config) || ($config['enabled'] ?? false)!==true) throw new RuntimeException('Access service disabled');
    return $config;
}
function kc_identity(array $config): string {
    // Only the authenticated Apache identity. HTTP_* headers are not identity.
    $name=$_SERVER['REMOTE_USER'] ?? '';
    if (!is_string($name) || !isset($config['users'][$name]) || ($config['users'][$name]['enabled'] ?? false)!==true) {
        http_response_code(403);throw new RuntimeException('Access denied');
    }
    return $name;
}
function kc_headers(): void {
    header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');header('Referrer-Policy: same-origin');
}
function kc_session(string $identity): void {
    ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
    session_name('KCACCESS');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']);
    session_start();
    if (($_SESSION['identity'] ?? '')!==$identity) {session_regenerate_id(true);$_SESSION=[];}
    $_SESSION['identity']=$identity;
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
function kc_post(array $config): void {
    if ($_SERVER['REQUEST_METHOD']!=='POST') {http_response_code(405);throw new RuntimeException('Method not allowed');}
    if (($_SERVER['HTTP_ORIGIN'] ?? '')!==$config['origin']) {http_response_code(403);throw new RuntimeException('Access denied');}
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')!==0) {http_response_code(415);throw new RuntimeException('Use JSON');}
    if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {http_response_code(403);throw new RuntimeException('Access denied');}
}
function kc_input(): array {
    $raw=file_get_contents('php://input',false,null,0,262145);
    if ($raw===false || strlen($raw)>262144) {http_response_code(413);throw new RuntimeException('Request too large');}
    $input=json_decode($raw,true,64,JSON_THROW_ON_ERROR);kc_require(is_array($input)&&!array_is_list($input));return $input;
}
function kc_b64(string $text): string {return rtrim(strtr(base64_encode($text),'+/','-_'),'=');}
function kc_key(array $config): array {
    $key=json_decode(file_get_contents($config['serviceAccountFile']),true,32,JSON_THROW_ON_ERROR);
    kc_require(($key['project_id'] ?? '')===$config['projectId'],'Wrong service project');return $key;
}
function kc_jwt(array $claims, array $key): string {
    $value=kc_b64(json_encode(['alg'=>'RS256','typ'=>'JWT'])).'.'.kc_b64(json_encode($claims,JSON_THROW_ON_ERROR));
    if (!openssl_sign($value,$signature,$key['private_key'],OPENSSL_ALGO_SHA256))throw new RuntimeException('Token signing failed');
    return $value.'.'.kc_b64($signature);
}
function kc_http(string $url, string $method, mixed $body, array $headers=[]): array {
    $curl=curl_init($url);curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CUSTOMREQUEST=>$method,
        CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>30,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,
        CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>$headers]);
    if($body!==null)curl_setopt($curl,CURLOPT_POSTFIELDS,$body);
    $raw=curl_exec($curl);$status=curl_getinfo($curl,CURLINFO_RESPONSE_CODE);curl_close($curl);
    if ($raw===false)throw new RuntimeException('Cloud unavailable');
    if ($status===409 || $status===412) {http_response_code(409);throw new RuntimeException('Job changed; reload before saving');}
    if($status<200 || $status>=300)throw new RuntimeException('Cloud request failed');
    return json_decode($raw,true,128,JSON_THROW_ON_ERROR);
}
function kc_oauth(array $config): string {
    static $token=null;if($token!==null)return $token;
    $key=kc_key($config);$now=time();
    $jwt=kc_jwt(['iss'=>$key['client_email'],'scope'=>'https://www.googleapis.com/auth/datastore',
        'aud'=>'https://oauth2.googleapis.com/token','iat'=>$now,'exp'=>$now+300],$key);
    $response=kc_http('https://oauth2.googleapis.com/token','POST',http_build_query([
        'grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$jwt]),['Content-Type: application/x-www-form-urlencoded']);
    return $token=$response['access_token'];
}
function kc_cloud(array $config,string $suffix,string $method='GET',mixed $data=null): array {
    $base='https://firestore.googleapis.com/v1/projects/'.rawurlencode($config['projectId']).'/databases/(default)/documents';
    return kc_http($base.$suffix,$method,$data===null?null:json_encode($data,JSON_THROW_ON_ERROR),
        ['Authorization: Bearer '.kc_oauth($config),'Content-Type: application/json']);
}
function kc_decode(array $value): mixed {
    if(isset($value['mapValue']))return kc_fields($value['mapValue']['fields'] ?? []);
    if(isset($value['arrayValue']))return array_map('kc_decode',$value['arrayValue']['values'] ?? []);
    if(isset($value['integerValue']))return (int)$value['integerValue'];
    if(array_key_exists('nullValue',$value))return null;
    return reset($value);
}
function kc_fields(array $fields): array {return array_map('kc_decode',$fields);}
function kc_encode(mixed $value): array {
    if($value===null)return ['nullValue'=>null];
    if(is_bool($value))return ['booleanValue'=>$value];
    if(is_int($value))return ['integerValue'=>(string)$value];
    if(is_float($value))return ['doubleValue'=>$value];
    if(is_string($value))return ['stringValue'=>$value];
    if(is_array($value) && array_is_list($value))return ['arrayValue'=>['values'=>array_map('kc_encode',$value)]];
    if(is_array($value))return ['mapValue'=>['fields'=>array_map('kc_encode',$value)]];
    throw new RuntimeException('Unsupported field');
}
function kc_job_doc(array $doc): array {
    $job=kc_fields($doc['fields'] ?? []);$job['id']=basename($doc['name']);return $job;
}
function kc_settings(array $config): array {return kc_fields(kc_cloud($config,'/config/settings')['fields'] ?? []);}
function kc_fail(Throwable $error): void {
    $status=http_response_code();if($status<400)$status=$error instanceof InvalidArgumentException || $error instanceof JsonException?400:503;
    http_response_code($status);
    $message=match($status){400=>'Invalid work sheet',403=>'Access denied',404=>'Job unavailable',409=>'Job changed; reload before saving',413=>'Request too large',405=>'Method not allowed',415=>'Use JSON',default=>'Access service unavailable'};
    echo json_encode(['error'=>$message]);
}
