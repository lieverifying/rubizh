<?php
declare(strict_types=1);
// Staging-only Nova Poshta transport with the live API's response shapes (A9). Never active on the production host.
// Test/stand control through meta: np_mock_save=unknown|reject (next TTN save), np_mock_status_<TTN>=<StatusCode>.
function npMockRef(string $seed): string {$h=hash('sha256','np-mock|'.$seed);return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20,12);}
function npMockCities(): array {return [['Ref'=>npMockRef('city:kyiv'),'Description'=>'Київ','AreaDescription'=>'Київська'],['Ref'=>npMockRef('city:lviv'),'Description'=>'Львів','AreaDescription'=>'Львівська'],['Ref'=>npMockRef('city:vinnytsia'),'Description'=>'Вінниця','AreaDescription'=>'Вінницька']];}
function npMockMeta(string $k,?string $v=null): ?string {
    $db=shopStoreDatabase();
    if($v!==null){$db->prepare('INSERT INTO meta(k,v) VALUES(?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute([$k,$v]);return $v;}
    $q=$db->prepare('SELECT v FROM meta WHERE k=?');$q->execute([$k]);$r=$q->fetchColumn();return $r===false?null:(string)$r;
}
function npMockApi(string $model,string $method,array $p): array {
    if(!npMockEnabled())throw new LogicException('NP mock is staging-only');
    $city=function(string $ref){foreach(npMockCities() as $c)if($c['Ref']===$ref)return $c;return ['Ref'=>$ref,'Description'=>'Київ','AreaDescription'=>'Київська'];};
    switch($model.'.'.$method){
        case 'Address.getCities':case 'Address.searchSettlements':
            if(isset($p['Ref']))return [$city((string)$p['Ref'])];
            $find=mb_strtolower((string)($p['FindByString']??''));return array_values(array_filter(npMockCities(),fn($c)=>$find===''||str_contains(mb_strtolower($c['Description']),$find)));
        case 'Address.getWarehouses':
            $c=$city((string)($p['CityRef']??npMockRef('city:kyiv')));$out=[];
            for($n=1;$n<=5;$n++){$ref=npMockRef('wh:'.$c['Ref'].':'.$n);if(isset($p['Ref'])&&$p['Ref']!==$ref)continue;$out[]=['Ref'=>$ref,'CityRef'=>$c['Ref'],'Number'=>(string)$n,'CityDescription'=>$c['Description'],'SettlementAreaDescription'=>$c['AreaDescription'],'Description'=>'Відділення №'.$n,'TotalMaxWeightAllowed'=>'1000','PlaceMaxWeightAllowed'=>'1000','CategoryOfWarehouse'=>'Branch'];}
            return $out;
        case 'Address.getStreet':return [['Ref'=>$p['Ref']??npMockRef('street:1'),'Description'=>'Хрещатик','StreetsType'=>'вул.']];
        case 'Address.save':return [['Ref'=>npMockRef('addr:'.json_encode($p))]];
        case 'Counterparty.getCounterparties':return [['Ref'=>npMockRef('sender')]];
        case 'Counterparty.getCounterpartyContactPersons':return [['Ref'=>npMockRef('contact'),'Phones'=>'380671234567']];
        case 'Counterparty.save':return [['Ref'=>npMockRef('recipient:'.($p['Phone']??'')),'ContactPerson'=>['data'=>[['Ref'=>npMockRef('rcontact:'.($p['Phone']??'')),'Phones'=>(string)($p['Phone']??'')]]]]];
        case 'InternetDocument.save':
            // A* COD field is a hard error here, as in the contract tests (A5).
            if(isset($p['BackwardDeliveryData'])||isset($p['AfterpaymentOnGoodsCost']))throw new RuntimeException('Mock NP: cash on delivery is forbidden');
            $marker=(string)($p['InfoRegClientBarcodes']??'');$number='2045'.substr(preg_replace('/\D/','',hash('crc32b',$marker).hexdec(substr(hash('sha256',$marker),0,8))).'0000000000',0,10);
            $doc=['Ref'=>npMockRef('doc:'.$marker),'IntDocNumber'=>$number,'CostOnSite'=>70,'InfoRegClientBarcodes'=>$marker,'AdditionalInformation'=>(string)($p['AdditionalInformation']??'')];
            $mode=npMockMeta('np_mock_save');if($mode==='reject'){npMockMeta('np_mock_save','');throw new NpRejected('НП відхилила дані посилки.');}
            npMockMeta('np_mock_doc_'.$number,json_encode($doc,JSON_THROW_ON_ERROR));
            if($mode==='unknown'){npMockMeta('np_mock_save','');throw new NpUnknownResult('НП не відповіла вчасно.');}
            return [$doc];
        case 'InternetDocument.getDocumentList':
            $rows=shopStoreDatabase()->query("SELECT v FROM meta WHERE k LIKE 'np_mock_doc_%' ORDER BY k")->fetchAll(PDO::FETCH_COLUMN);$docs=array_map(fn($r)=>json_decode($r,true),$rows);
            if(isset($p['IntDocNumber']))$docs=array_values(array_filter($docs,fn($d)=>$d['IntDocNumber']===$p['IntDocNumber']));
            return $docs;
        case 'InternetDocument.delete':
            foreach((array)($p['DocumentRefs']??[]) as $ref)foreach(shopStoreDatabase()->query("SELECT k,v FROM meta WHERE k LIKE 'np_mock_doc_%'")->fetchAll(PDO::FETCH_KEY_PAIR) as $k=>$v)if((json_decode($v,true)['Ref']??'')===$ref)shopStoreDatabase()->prepare('DELETE FROM meta WHERE k=?')->execute([$k]);
            return [['Ref'=>$p['DocumentRefs'][0]??'']];
        case 'TrackingDocument.getStatusDocuments':
            // Stand control: the last tracking request (numbers and phones) is kept for tests.
            shopStoreDatabase()->prepare("INSERT INTO meta(k,v) VALUES('np_mock_last_tracking',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([json_encode(array_values((array)($p['Documents']??[])))]);
            return array_map(fn($d)=>['Number'=>$d['DocumentNumber'],'StatusCode'=>npMockMeta('np_mock_status_'.$d['DocumentNumber'])??'1','WarehouseRecipient'=>'Відділення №1'],(array)($p['Documents']??[]));
    }
    throw new RuntimeException('Mock NP: unsupported call '.$model.'.'.$method);
}
