<?php
declare(strict_types=1);

// Server-only policy. Never pass a full Firestore document to the employee.
const KC_COUNT_FIELDS = ['singleChannelCount','multiChannel6Count','multiChannel8Count','multiChannel12Count','multiChannel16Count'];
function kc_require(bool $condition, string $message = 'Invalid work sheet'): void {
    if (!$condition) throw new InvalidArgumentException($message);
}
function kc_text(mixed $value, int $max = 500): string {
    kc_require(is_string($value) && strlen($value) <= $max);
    return $value;
}
function kc_date(mixed $value): bool {
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) return false;
    [$y,$m,$d] = array_map('intval', explode('-', $value));
    return checkdate($m,$d,$y);
}
function kc_active(array $job): bool {
    return empty($job['historicalJob']) && empty($job['deletedAt']) && empty($job['isDeleted'])
        && !in_array(strtolower((string)($job['status'] ?? '')), ['completed','closed','deleted','cancelled'], true);
}
function kc_participants(array $job): array {
    $lead = ($job['assignedPerson'] ?? '') === 'shelley' ? 'shelley' : 'owner';
    $second = $job['secondPerson'] ?? $job['quoteSnapshot']['secondPerson'] ?? false;
    $other = $job['secondPersonKind'] ?? $job['quoteSnapshot']['secondPersonKind'] ?? 'phil';
    if (!in_array($other, ['owner','shelley','phil'], true) || $other === $lead) $other = 'phil';
    return $second ? [$lead,$other] : [$lead];
}
function kc_assigned(array $job): bool {
    return kc_active($job) && in_array('shelley', kc_participants($job), true);
}
function kc_counts(array $row): array {
    $result=[];
    foreach (KC_COUNT_FIELDS as $key) $result[$key]=max(0,(int)($row[$key] ?? 0));
    return $result;
}
function kc_sum(array $rows): array {
    $result=array_fill_keys(KC_COUNT_FIELDS,0);
    foreach ($rows as $row) foreach (kc_counts($row) as $key=>$value) $result[$key]+=$value;
    return $result;
}
function kc_levels(array $job, array $settings): array {
    return array_values(array_map(fn($l)=>['id'=>(string)$l['id'],'name'=>(string)($l['name'] ?? '')],
        $job['settingsSnapshot']['serviceLevels'] ?? $settings['serviceLevels'] ?? []));
}
function kc_calendar(array $job): array {
    $joining=$job['shelleyJoiningDates'] ?? $job['quoteSnapshot']['shelleyJoiningDates'] ?? [];
    return [
        'id'=>(string)$job['id'], 'customerName'=>(string)($job['customerName'] ?? ''),
        'quoteRef'=>(string)($job['quoteRef'] ?? ''),
        'assignedPerson'=>kc_participants($job)[0], 'participants'=>kc_participants($job),
        'scheduleStartDate'=>kc_date($job['scheduleStartDate'] ?? null)?$job['scheduleStartDate']:'',
        'scheduleEndDate'=>kc_date($job['scheduleEndDate'] ?? null)?$job['scheduleEndDate']:($job['scheduleStartDate'] ?? ''),
        'scheduleStatus'=>($job['scheduleStatus'] ?? '')==='provisional'?'provisional':'booked',
        'shelleyJoiningDates'=>array_values(array_unique(array_filter($joining,'kc_date'))),
    ];
}
const KC_EXPENSE_FIELDS = ['mileageMiles','hotel','food','travel','other'];
function kc_expenses(array $source): array {
    $out=[];foreach(KC_EXPENSE_FIELDS as $key)$out[$key]=round(max(0,(float)($source[$key] ?? 0)),2);
    return $out;
}
function kc_validate_expenses(mixed $source): array {
    kc_require(is_array($source) && !array_diff(array_keys($source),KC_EXPENSE_FIELDS));
    foreach(KC_EXPENSE_FIELDS as $key){
        $value=$source[$key] ?? null;
        kc_require((is_int($value)||is_float($value)) && is_finite((float)$value) && $value>=0 && $value<=100000 && abs($value-round($value,2))<0.000001);
    }
    return kc_expenses($source);
}
function kc_sheet(array $job, array $settings, string $version): array {
    kc_require(kc_assigned($job),'Job unavailable');
    $rows=array_map(fn($r)=>['id'=>(string)$r['id'],'date'=>(string)($r['date'] ?? ''),
        'serviceLevelId'=>(string)($r['serviceLevelId'] ?? ''),...kc_counts($r)],$job['actualEntries'] ?? []);
    $expected=kc_sum($job['plannedLines'] ?? []);$actual=kc_sum($rows);
    $remaining=[];foreach(KC_COUNT_FIELDS as $key)$remaining[$key]=$expected[$key]-$actual[$key];
    return [...kc_calendar($job),'version'=>$version,'customerAddress'=>(string)($job['customerAddress'] ?? ''),
        'destinationPostcode'=>(string)($job['destinationPostcode'] ?? $job['quoteSnapshot']['destinationPostcode'] ?? ''),
        'serviceLevels'=>kc_levels($job,$settings),'expected'=>$expected,'actual'=>$actual,'remaining'=>$remaining,
        'actualEntries'=>$rows,
        // Existing parts are quantity-editable. Prices and private metadata stay server-side.
        'parts'=>array_values(array_map(fn($p)=>['id'=>(string)$p['id'],'name'=>(string)($p['name'] ?? $p['description'] ?? ''),
            'quantity'=>max(0,(int)($p['quantity'] ?? 0))],$job['parts'] ?? [])),
        // Deliberately separate from existing owner notes and workCarriedOut.
        'employeeWorkCarriedOut'=>(string)($job['employeeWorkCarriedOut'] ?? ''),
        'employeeNotes'=>(string)($job['employeeNotes'] ?? ''),
        'employeeInstructions'=>(string)($job['employeeInstructions'] ?? ''),
        'employeeExpenses'=>kc_expenses($job['employeeExpenses'] ?? []),
    ];
}
function kc_patch(array $job, array $settings, array $input, string $identity): array {
    kc_require(kc_assigned($job),'Job unavailable');
    $allowed=['id','version','actualEntries','parts','employeeWorkCarriedOut','employeeNotes','employeeExpenses'];
    kc_require(!array_diff(array_keys($input),$allowed));
    foreach(array_diff($allowed,['employeeExpenses']) as $key) kc_require(array_key_exists($key,$input));
    kc_require($input['id'] === $job['id']);
    kc_text($input['version'],100);
    $levels=array_column(kc_levels($job,$settings),'id');
    kc_require(is_array($input['actualEntries']) && array_is_list($input['actualEntries']) && count($input['actualEntries'])<=500);
    $rows=[];$seen=[];$old=[];
    foreach($job['actualEntries'] ?? [] as $row)$old[$row['id']]=$row;
    foreach($input['actualEntries'] as $row){
        kc_require(is_array($row) && !array_diff(array_keys($row),['id','date','serviceLevelId',...KC_COUNT_FIELDS]));
        $id=kc_text($row['id'] ?? null,100);kc_require((bool)preg_match('/^[A-Za-z0-9_-]+$/D',$id) && !isset($seen[$id]));$seen[$id]=true;
        kc_require(kc_date($row['date'] ?? null));
        kc_require(in_array($row['serviceLevelId'] ?? null,$levels,true));
        foreach(KC_COUNT_FIELDS as $key) kc_require(isset($row[$key]) && is_int($row[$key]) && $row[$key]>=0 && $row[$key]<=100000);
        // Preserve any owner-only row metadata on existing entries.
        $rows[]=[...($old[$id] ?? []),...$row];
    }
    kc_require(is_array($input['parts']) && array_is_list($input['parts']) && count($input['parts'])<=500);
    $existing=[];foreach($job['parts'] ?? [] as $part)$existing[$part['id']]=$part;
    $parts=[];$seen=[];
    foreach($input['parts'] as $part){
        kc_require(is_array($part) && !array_diff(array_keys($part),['id','quantity']));
        $id=kc_text($part['id'] ?? null,100);
        kc_require(isset($existing[$id]) && !isset($seen[$id]) && isset($part['quantity']) && is_int($part['quantity']) && $part['quantity']>=0 && $part['quantity']<=100000);
        $seen[$id]=true;$parts[]=[...$existing[$id],'quantity'=>$part['quantity']];
    }
    // Omitting an existing part may not silently delete owner pricing records.
    kc_require(count($parts)===count($existing));
    return ['actualEntries'=>$rows,'parts'=>$parts,
        'employeeExpenses'=>array_key_exists('employeeExpenses',$input)?kc_validate_expenses($input['employeeExpenses']):kc_expenses($job['employeeExpenses'] ?? []),
        'employeeWorkCarriedOut'=>kc_text($input['employeeWorkCarriedOut'],10000),
        'employeeNotes'=>kc_text($input['employeeNotes'],10000),
        'employeeUpdatedBy'=>$identity,'employeeRevision'=>bin2hex(random_bytes(16)),
        'employeeUpdatedAt'=>gmdate('c'),'updatedAt'=>gmdate('c')];
}
