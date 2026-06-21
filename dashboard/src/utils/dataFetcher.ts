export interface Recording {
  videoId: string; title: string; channel: string; date: string; videoUrl: string;
  durationSec: number; durationFmt: string; sizeHuman: string; sizeGb: number; resolution: string; thumbnail: string;
  archiveLink: string; archiveDirect: string; archiveNode: string;
  megaLink: string; pixeldrainLink: string; gofileLink: string;
  githubRelease: string; githubDirect: string;
  gdriveLink: string; telegramLink: string; r2Link: string;
  aiChapters: { time: number; label: string }[];
  transcriptUrl: string; chatUrl: string;
}
const _S=[atob('aHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L2doL3VzZXJtdW5lZWIxL1N0cmVhbS1SZWNvcmRlckBtYWlu'),atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3VzZXJtdW5lZWIxL1N0cmVhbS1SZWNvcmRlci9tYWlu')];
async function _f(p:string):Promise<string|null>{for(const b of _S){try{const r=await fetch(`${b}/${p}?_=${Date.now()}`);if(r.ok)return r.text();}catch{}}return null;}
function clean(t:string){return(t||'').replace(/\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\s*$/g,'').replace(/\s{2,}/g,' ').trim();}
function fmtD(f:string){if(!f)return'';const p=f.split(':');return p.length===3?`${parseInt(p[0])}h ${parseInt(p[1])}m`:f;}
function thumb(id:string,t?:string){if(t&&t.startsWith('http'))return t;if(id?.match?.(/^[\w-]{11}$/))return`https://i.ytimg.com/vi/${id}/hqdefault.jpg`;return'/thumbnail.jpg';}

function dedup(recs:Recording[]):Recording[]{
  // Group by YouTube video ID extracted from video_url
  const map=new Map<string,Recording>();
  for(const r of recs){
    // Extract 11-char YouTube ID from the video URL
    const m=r.videoUrl?.match?.(/(?:v=|\/)([\w-]{11})/);
    const ytId=m?m[1]:'';
    // Skip entries that don't have a YouTube video URL (archive-only duplicates)
    if(!ytId) continue;
    const ex=map.get(ytId);
    if(!ex){map.set(ytId,{...r,videoId:ytId});continue;}
    // Merge — keep the one with more data
    const mg:any={...ex};
    for(const f of['archiveDirect','archiveNode','archiveLink','megaLink','pixeldrainLink','gofileLink','githubRelease','githubDirect','transcriptUrl','chatUrl']as const)
      if(!mg[f]&&(r as any)[f])mg[f]=(r as any)[f];
    if(!mg.aiChapters?.length&&r.aiChapters?.length)mg.aiChapters=r.aiChapters;
    if(!mg.thumbnail?.startsWith('http')&&r.thumbnail?.startsWith('http'))mg.thumbnail=r.thumbnail;
    // Prefer higher resolution
    if(r.resolution?.includes('1080')&&!mg.resolution?.includes('1080'))mg.resolution=r.resolution;
    map.set(ytId,mg);
  }
  return[...map.values()];
}

export async function fetchRecordings():Promise<Recording[]>{
  const txt=await _f('data/recordings.json');
  if(!txt)return[];
  try{
    return dedup(
      (JSON.parse(txt)as any[])
        .filter(r=>(r.channel||'').toLowerCase().includes('muslim lantern'))
        .map(r=>({
          videoId:r.video_id||'',title:clean(r.title||''),channel:r.channel||'',
          date:r.date||'',videoUrl:r.video_url||'',
          durationSec:r.duration_sec||0,durationFmt:fmtD(r.duration_fmt||''),
          sizeHuman:r.size_human||'',sizeGb:r.size_gb||0,resolution:r.resolution||'',
          thumbnail:thumb(r.video_id,r.thumbnail),
          archiveLink:r.archive_link||'',archiveDirect:r.archive_direct||'',archiveNode:r.archive_node||'',
          megaLink:r.mega_link||'',pixeldrainLink:r.pixeldrain_link||'',gofileLink:r.gofile_link||'',
          githubRelease:r.github_release||'',githubDirect:r.github_direct||'',
          gdriveLink:r.gdrive_link||'',telegramLink:r.telegram_link||'',r2Link:r.r2_link||'',
          aiChapters:(r.ai_chapters||[]),
          transcriptUrl:r.transcript_url||'',chatUrl:r.chat_url||''
        }))
    ).sort((a,b)=>b.date.localeCompare(a.date));
  }catch{return[];}
}
