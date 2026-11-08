<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/server/firebase-bridge.php';
kc_headers();
try {
    $config=kc_config();$identity=kc_identity($config);$role=$config['users'][$identity]['role'] ?? '';
    if($role!=='owner' && !($role==='employee' && $identity==='ShelleyCoates')){http_response_code(403);throw new RuntimeException('Access denied');}
    kc_session($identity);
    if($_SERVER['REQUEST_METHOD']==='GET'){
        $settings=kc_settings($config);$sheets=[];$calendar=[];$page='';
        do {
            $response=kc_cloud($config,'/jobs?pageSize=300'.($page?'&pageToken='.rawurlencode($page):''));
            foreach($response['documents'] ?? [] as $doc){
                $job=kc_job_doc($doc);if(!kc_active($job))continue;
                $calendar[]=kc_calendar($job);
                if(kc_assigned($job))$sheets[]=kc_sheet($job,$settings,$doc['updateTime']);
            }
            $page=$response['nextPageToken'] ?? '';
        }while($page!=='');
        echo json_encode(['csrf'=>$_SESSION['csrf'],'jobs'=>$sheets,'calendar'=>$calendar],JSON_THROW_ON_ERROR);exit;
    }
    kc_post($config);$input=kc_input();$id=kc_text($input['id'] ?? null,150);
    kc_require((bool)preg_match('/^[A-Za-z0-9_-]+$/D',$id));
    $doc=kc_cloud($config,'/jobs/'.rawurlencode($id));$job=kc_job_doc($doc);
    if(!kc_assigned($job)){http_response_code(404);throw new RuntimeException('Job unavailable');}
    if(($input['version'] ?? '')!==$doc['updateTime']){http_response_code(409);throw new RuntimeException('Job changed');}
    $settings=kc_settings($config);$patch=kc_patch($job,$settings,$input,$identity);
    // Atomic precondition prevents reassignment/deletion races between read and commit.
    $mask=implode('&',array_map(fn($key)=>'updateMask.fieldPaths='.rawurlencode($key),array_keys($patch)));
    $saved=kc_cloud($config,'/jobs/'.rawurlencode($id).'?'.$mask.'&currentDocument.updateTime='.rawurlencode($doc['updateTime']),
        'PATCH',['fields'=>array_map('kc_encode',$patch)]);
    echo json_encode(['job'=>kc_sheet(kc_job_doc($saved),$settings,$saved['updateTime'])],JSON_THROW_ON_ERROR);
}catch(Throwable $error){kc_fail($error);}
