<?php
declare(strict_types=1);
ob_start();
require __DIR__.'/../server/firebase-bridge.php';
function check(bool $condition,string $name):void {if(!$condition)throw new RuntimeException('FAIL: '.$name);echo 'PASS: '.$name.PHP_EOL;}
function denied(callable $action,string $name):void {try{$action();}catch(InvalidArgumentException $e){check(true,$name);return;}throw new RuntimeException('FAIL: '.$name);}
$row=['id'=>'row1','date'=>'2026-11-09','serviceLevelId'=>'standard',...array_fill_keys(KC_COUNT_FIELDS,2)];
$job=['id'=>'job1','assignedPerson'=>'shelley','customerName'=>'Test laboratory','customerAddress'=>'Test site',
    'scheduleStartDate'=>'2026-11-09','scheduleEndDate'=>'2026-11-13','plannedLines'=>[$row],'actualEntries'=>[$row],
    'parts'=>[['id'=>'part1','name'=>'Seal','quantity'=>1,'pricePerUnit'=>7,'costPerUnit'=>14,'private'=>'FINANCIAL_SENTINEL']],
    'profit'=>'FINANCIAL_SENTINEL','costs'=>['hotel'=>'FINANCIAL_SENTINEL'],'quoteSnapshot'=>['notes'=>'FINANCIAL_SENTINEL'],
    'settingsSnapshot'=>['serviceLevels'=>[['id'=>'standard','name'=>'Standard','price'=>99]],'wage'=>'FINANCIAL_SENTINEL'],
    'notes'=>'FINANCIAL_SENTINEL','operationalNotes'=>'FINANCIAL_SENTINEL','workCarriedOut'=>'FINANCIAL_SENTINEL',
    'employeeInstructions'=>'Check pipettes','employeeWorkCarriedOut'=>'Cleaned','employeeNotes'=>'Seal replaced'];
$settings=['serviceLevels'=>[['id'=>'standard','name'=>'Standard']],'partsCatalog'=>[['price'=>'FINANCIAL_SENTINEL']]];
$sheet=kc_sheet($job,$settings,'v1');check(!str_contains(json_encode($sheet),'FINANCIAL_SENTINEL'),'projection excludes nested finances and owner notes');
check(!isset($sheet['parts'][0]['costPerUnit'])&&!isset($sheet['serviceLevels'][0]['price']),'parts and service levels expose no prices');
check(kc_assigned($job),'lead assignee allowed');
$shared=[...$job,'assignedPerson'=>'owner','secondPerson'=>true,'secondPersonKind'=>'shelley'];check(kc_assigned($shared),'explicit shared assignment allowed');
check(!kc_assigned([...$shared,'secondPerson'=>false]),'second-worker label alone does not grant access');
check(!kc_assigned([...$job,'assignedPerson'=>'owner']),'unassigned denied');
foreach(['closed','completed','deleted','cancelled'] as $state)check(!kc_assigned([...$job,'status'=>$state]),$state.' denied');
check(!kc_assigned([...$job,'historicalJob'=>true]),'historical denied');
$input=['id'=>'job1','version'=>'v1','actualEntries'=>[$row],'parts'=>[['id'=>'part1','quantity'=>3]],'employeeWorkCarriedOut'=>'Cleaned','employeeNotes'=>'New seal'];
$patch=kc_patch($job,$settings,$input,'ShelleyCoates');
check($patch['parts'][0]['pricePerUnit']===7&&$patch['parts'][0]['costPerUnit']===14,'quantity edits preserve stored pricing');
check(!array_diff(array_keys($patch),['actualEntries','parts','employeeWorkCarriedOut','employeeNotes','employeeUpdatedBy','employeeRevision','employeeUpdatedAt','updatedAt']),'patch has an explicit top-level allow-list');
check($patch['employeeUpdatedBy']==='ShelleyCoates','server stamps audit identity');
foreach(['assignedPerson','costs','quoteSnapshot','settingsSnapshot','employeeInstructions','profit','status','__proto__'] as $field)denied(fn()=>kc_patch($job,$settings,[...$input,$field=>'forged'],'ShelleyCoates'),'reject '.$field);
denied(fn()=>kc_patch($job,$settings,[...$input,'actualEntries'=>[[...$row,'costPerUnit'=>99]]],'ShelleyCoates'),'reject nested financial field');
denied(fn()=>kc_patch($job,$settings,[...$input,'actualEntries'=>[[...$row,'singleChannelCount'=>-1]]],'ShelleyCoates'),'reject negative counts');
denied(fn()=>kc_patch($job,$settings,[...$input,'actualEntries'=>[[...$row,'singleChannelCount'=>1.5]]],'ShelleyCoates'),'reject fractional counts');
denied(fn()=>kc_patch($job,$settings,[...$input,'actualEntries'=>[[...$row,'date'=>'2026-02-30']]],'ShelleyCoates'),'reject invalid dates');
denied(fn()=>kc_patch($job,$settings,[...$input,'actualEntries'=>[[...$row,'serviceLevelId'=>'forged']]],'ShelleyCoates'),'reject unknown service level');
denied(fn()=>kc_patch($job,$settings,[...$input,'actualEntries'=>[$row,$row]],'ShelleyCoates'),'reject duplicate row ids');
denied(fn()=>kc_patch($job,$settings,[...$input,'parts'=>[['id'=>'forged','quantity'=>1]]],'ShelleyCoates'),'reject unknown parts');
denied(fn()=>kc_patch($job,$settings,[...$input,'parts'=>[]],'ShelleyCoates'),'reject deletion of owner pricing records');
denied(fn()=>kc_patch([...$job,'assignedPerson'=>'owner'],$settings,$input,'ShelleyCoates'),'recheck assignment before writes');
check(kc_decode(kc_encode(['a'=>[1,2],'b'=>true,'c'=>'hello','d'=>null]))===['a'=>[1,2],'b'=>true,'c'=>'hello','d'=>null],'Firestore value round trip');
$_SERVER=['HTTP_REMOTE_USER'=>'Danwalters','HTTP_X_USER'=>'Danwalters'];
try{kc_identity(['users'=>['Danwalters'=>['enabled'=>true]]]);throw new LogicException('Forged header granted access');}catch(RuntimeException $error){check($error->getMessage()==='Access denied','identity ignores forged HTTP headers');}
$_SERVER['REMOTE_USER']='ShelleyCoates';check(kc_identity(['users'=>['ShelleyCoates'=>['enabled'=>true]]])==='ShelleyCoates','identity uses exact Apache principal');
try{kc_identity(['users'=>['ShelleyCoates'=>['enabled'=>false]]]);throw new LogicException('Disabled user granted access');}catch(RuntimeException $error){check($error->getMessage()==='Access denied','disabled principal denied');}
$_SESSION=['csrf'=>'test-token'];
$_SERVER=['REQUEST_METHOD'=>'POST','HTTP_ORIGIN'=>'https://test.example','CONTENT_TYPE'=>'application/json','HTTP_X_CSRF_TOKEN'=>'test-token'];
kc_post(['origin'=>'https://test.example']);check(true,'same-origin JSON with session CSRF token accepted');
foreach(['HTTP_ORIGIN'=>'https://evil.example','HTTP_X_CSRF_TOKEN'=>'forged','CONTENT_TYPE'=>'text/plain','REQUEST_METHOD'=>'GET'] as $key=>$value){
    $saved=$_SERVER[$key];$_SERVER[$key]=$value;
    try{kc_post(['origin'=>'https://test.example']);throw new LogicException('Unsafe request accepted');}catch(RuntimeException $e){check(true,'reject invalid '.$key);}$_SERVER[$key]=$saved;
}
$rsa=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA]);openssl_pkey_export($rsa,$pem);
$jwt=kc_jwt(['uid'=>'cpanel-owner','role'=>'owner'],['private_key'=>$pem]);[$h,$p,$s]=explode('.',$jwt);
$unb64=fn($s)=>base64_decode(strtr($s,'-_','+/'));
check(openssl_verify($h.'.'.$p,$unb64($s),openssl_pkey_get_details($rsa)['key'],OPENSSL_ALGO_SHA256)===1,'bridge JWT has a valid RSA SHA256 signature');
check(openssl_verify($h.'.'.$p.'tampered',$unb64($s),openssl_pkey_get_details($rsa)['key'],OPENSSL_ALGO_SHA256)===0,'modified bridge JWT is rejected');
