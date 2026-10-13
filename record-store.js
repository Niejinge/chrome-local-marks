/* All record mutations run in one service-worker queue. */
const LocalMarksStore = (() => {
  const RECORDS='readerMarksV1', STYLES='readerMarksStyleV3', META='readerMarksStoreMetaV1';
  const validUrl=value=>{try{return ['http:','https:','file:'].includes(new URL(value).protocol)}catch{return false}};
  const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
  function create(storage){
    let queue=Promise.resolve();
    async function execute(command){
      if(!command||typeof command!=='object'||Array.isArray(command))throw Error('无效保存操作');
      const data=await storage.get(null),records=Array.isArray(data[RECORDS])?data[RECORDS]:[];
      const meta=structuredClone(data[META]||{deleted:{},undo:{}});meta.deleted||={};meta.undo||={};
      const now=Date.now();for(const [key,value] of Object.entries(meta.undo))if(value.expiresAt<=now)delete meta.undo[key];
      let next=[...records],record=null,added=0,skipped=0,undoToken=null,deletedRecords=[],expiresAt=0;
      const changes={};
      const deleteIds=(ids,undo)=>{
        const set=new Set(ids);deletedRecords=next.filter(item=>set.has(item.id));next=next.filter(item=>!set.has(item.id));
        for(const item of deletedRecords)meta.deleted[item.id]=true;
        if(undo&&deletedRecords.length){undoToken=crypto.randomUUID();expiresAt=now+8000;meta.undo[undoToken]={ids:deletedRecords.map(item=>item.id),expiresAt};}
      };
      if(command.op==='upsert'){
        const item=command.record,id=item?.id||command.id,existing=next.find(item=>item.id===id);
        if(!id||(!existing&&(!command.allowCreate||meta.deleted[id])))throw Error('此标记已被删除');
        record={...(existing||item),...(command.patch||{}),id,updatedAt:new Date().toISOString()};
        if(!['page','selection'].includes(record.kind)||!validUrl(record.url))throw Error('无效标记');
        if(record.kind==='selection'&&(!record.quote||!Number.isSafeInteger(record.start)||!Number.isSafeInteger(record.end)||record.end<=record.start))throw Error('无效原文位置');
        if(typeof record.note==='string'&&record.note.length>10000)throw Error('笔记不能超过 10000 字');
        next=next.filter(item=>item.id!==id);
        if(record.kind==='page'||record.isBookmark||record.highlightColor||record.underlineColor||record.note?.trim())next.push(record);
        else meta.deleted[id]=true;
      }else if(command.op==='note-delete'){
        const item=next.find(item=>item.id===command.id);
        if(!item)throw Error('此笔记已被删除');
        if(!item.note?.trim())throw Error('此标记没有笔记');
        const removed=item.kind!=='page'&&!item.isBookmark&&!item.highlightColor&&!item.underlineColor;
        deletedRecords=[structuredClone(item)];
        if(removed){next=next.filter(record=>record.id!==item.id);meta.deleted[item.id]=true;}
        else next=next.map(record=>record.id===item.id?{...record,note:'',updatedAt:new Date().toISOString()}:record);
        undoToken=crypto.randomUUID();expiresAt=now+8000;
        meta.undo[undoToken]={ids:[item.id],expiresAt,kind:'note',removed};
      }else if(command.op==='delete')deleteIds(command.ids||[],command.undo===true);
      else if(command.op==='page-toggle'){
        const item=command.record;
        if(!item?.id||!validUrl(item.url))throw Error('此页面不支持收藏');
        const existing=next.find(record=>record.kind==='page'&&record.url===item.url);
        if(existing)deleteIds([existing.id],true);else next.push({...item,kind:'page'});
      }else if(command.op==='import'){
        const parsed=LocalMarksBackup.parse(LocalMarksBackup.create(command.records||[],command.styles||null));
        const merged=LocalMarksBackup.merge(next,parsed.records);next=merged.records;added=merged.added;skipped=merged.skipped;
        for(const item of next)delete meta.deleted[item.id];
        if(parsed.styles)changes[STYLES]=parsed.styles;
      }else if(command.op==='undo'){
        const token=meta.undo[command.token];
        if(!token||token.expiresAt<=now)throw Error('撤销时间已过');
        const ids=new Set(token.ids),existing=new Set(next.map(item=>item.id));
        const parsed=LocalMarksBackup.parse(LocalMarksBackup.create(command.records||[],null));
        for(const item of parsed.records)if(ids.has(item.id)){
          const latest=next.find(record=>record.id===item.id);
          if(token.kind==='note'&&latest){
            if(latest.note?.trim())throw Error('已有新笔记，无法撤销覆盖');
            next=next.map(record=>record.id===item.id?{...record,note:item.note,noteStyle:item.noteStyle,updatedAt:new Date().toISOString()}:record);
          }else if(token.kind==='note'&&!token.removed)throw Error('原标记已被删除，无法恢复笔记');
          else if(!existing.has(item.id)){next.push(item);delete meta.deleted[item.id];added++;}
        }
        delete meta.undo[command.token];
      }else if(command.op==='styles-init'){if(!data[STYLES])changes[STYLES]=LocalMarksStyles.normalize(command.styleDefaults);}
      else if(command.op!=='styles')throw Error('未知保存操作');
      if(command.annotationMode != null){
        if(!LocalMarksStyles.annotationModes.includes(command.annotationMode))throw Error('无效默认标注类型');
        if(command.op!=='upsert')throw Error('默认类型需与标记一起保存');
        changes.readerMarksAnnotationModeV1=command.annotationMode;
      }
      if(command.styleMode){
        if(!LocalMarksStyles.meta[command.styleMode])throw Error('无效样式类型');
        const styles=LocalMarksStyles.normalize(data[STYLES]);styles[command.styleMode]=LocalMarksStyles.normalize({[command.styleMode]:command.styleConfig})[command.styleMode];changes[STYLES]=styles;
      }
      if(JSON.stringify(next)!==JSON.stringify(data[RECORDS]||[]))changes[RECORDS]=next;
      if(JSON.stringify(meta)!==JSON.stringify(data[META]||{}))changes[META]=meta;
      const used=storage.getBytesInUse?await storage.getBytesInUse(null):bytes(data);
      const projected=used+Object.entries(changes).reduce((n,[key,value])=>n+bytes(value)-(key in data?bytes(data[key]):0)+(key in data?0:key.length),0);
      if(projected>(storage.QUOTA_BYTES||10485760))throw Error('存储空间不足，请先导出备份并清理记录');
      try{await storage.set(changes);}catch(error){if(/quota|QUOTA_BYTES/i.test(error.message||''))throw Error('存储空间不足，请先导出备份并清理记录');throw error;}
      return {records:next,record,styles:changes[STYLES]||data[STYLES],undoToken,deletedRecords,expiresAt,added,skipped};
    }
    return {mutate(command){const job=queue.catch(()=>{}).then(()=>execute(command));queue=job;return job;}};
  }
  return {create};
})();
if(typeof module!=='undefined')module.exports=LocalMarksStore;
