import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { inferCatalogSection } from './catalog-section-inference';
import { extractKnownHusqvarnaModel } from './husqvarna-domain-knowledge';

export interface ExtractedPart { manufacturer:string; model:string; pnc:string; universalAcrossPnc:boolean; section:string; position:string; name:string; alternativeNames:string[]; partNumber:string; page:number; notes:string; }
export interface CatalogExtraction { manufacturer:string; models:string[]; pncs:string[]; parts:ExtractedPart[]; }

export interface ExtractedPart { manufacturer:string; model:string; pnc:string; universalAcrossPnc:boolean; section:string; position:string; name:string; alternativeNames:string[]; partNumber:string; page:number; notes:string; }
export interface CatalogExtraction { manufacturer:string; models:string[]; pncs:string[]; parts:ExtractedPart[]; }
export interface CatalogHints { manufacturer?:string|null; model?:string|null; pnc?:string|null; filename?:string|null; }
export interface DeterministicExtraction { extraction:CatalogExtraction; method:'HUSQVARNA_IPL_TEXT'; }

const SPACED_PART_NUMBER_PATTERN='\\d{3}[\\s\\u00a0]+\\d{2}[\\s\\u00a0]+\\d{2}-\\d{2}';
const CONTIGUOUS_PART_NUMBER_PATTERN='\\d{8,12}';
const PART_NUMBER_PATTERN=`(?:${SPACED_PART_NUMBER_PATTERN}|${CONTIGUOUS_PART_NUMBER_PATTERN})`;
const HUSQVARNA_ROW=new RegExp(`^(\\d{1,3}[A-Z]?(?:[-.]\\d{1,2})?)\\s+(${SPACED_PART_NUMBER_PATTERN})\\s+(.+?)\\s+([A-Z])\\s+(\\d+)(?:\\s+(.+))?$`,'i');
const GENERIC_PART_ROW=new RegExp(`^(\\d{1,3}[A-Z]?(?:[-.]\\d{1,2})?)\\s+(${SPACED_PART_NUMBER_PATTERN})\\s+(.+?)\\s+(\\d+)(?:\\s+(.+))?$`,'i');
const FLEXIBLE_ROW_START=new RegExp(`^(\\d{1,3}[A-Z]?(?:[-.]\\d{1,2})?)\\s+(${PART_NUMBER_PATTERN})\\s*(.*)$`,'i');
const PART_NUMBER_ONLY=new RegExp(`^(${PART_NUMBER_PATTERN})\\s*(.*)$`,'i');
const LEGACY_PAGE_MARKER=/--\s+(\d+)\s+of\s+\d+\s+--/g;
const PORTAL_PAGE_MARKER=/https?:\/\/[^\s]+[\t ]+(\d{1,4})\/(\d{1,4}?)(?=(?:\d{2}\/\d{2}\/\d{4})|[\s\r\n]|$)/g;
const PNC_PATTERN=/\b(?:\d{11}|\d{9})\b/g;
const MODEL_NOISE=/\b(?:ASSY|ASSEMBLY|CARBURETTOR|CARBURETOR|CHASSIS|COVER|TAMPA|FIO|FIOS|WIRE|WIRES|PARAFUSO|SCREW|PORCA|NUT|ARRUELA|WASHER|PE[CÇ]A|PARTS?)\b/i;
const GENERIC_SECTIONS=new Set(['pecas','parts','spare parts','lista de pecas','items','itens']);
const TECHNICAL_SECTION_PATTERN=/\b(?:CYLINDER|PISTON|AIR\s+FILTER|FILTER|MUFFLER|SILENCER|HANDLE|FUEL|HOUSING|SHAFT|CRANKCASE|CLUTCH|CLUTCHDRUM|STARTER|CARBURET(?:OR|TOR)|CARBURETTOR|IGNITION|GEAR|GEARBOX|CUTTING|GUARD|HARNESS|TANK|THROTTLE|DECK|TRANSMISSION|DRIVE|WHEEL|FRAME|STEERING|ELECTRICAL|ENGINE|FLYWHEEL|BRAKE|COVER|PUMP|BLADE|BAR|CHAIN|TUBE|PIPE|CONTROL|ANTI.?VIBRATION)\b/i;

function clean(v:unknown){return typeof v==='string'?v.trim():'';}
function compactModel(v:string){return v.replace(/\s+/g,'');}
function normalizedLine(v:string){return v.replace(/\u00a0/g,' ').replace(/[\u00ad\ufffe\ufffd]/g,'-').replace(/[ \t]+/g,' ').trim();}
function comparable(v:string){return normalizedLine(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isPartsHeader(v:string){
  const l=normalizedLine(v).toLowerCase();
  const hasRefOrPos=/\b(?:refer[eê]ncia|pos(?:ition)?\.?|key\s+part|item)\b/i.test(l);
  const hasPartCol=/\b(?:part\s*(?:nr|no|number)\.?|n[uú]mero\s+do\s+artigo|c[oó]digo)\b/i.test(l);
  const hasDescCol=/\b(?:description|descri[cç][aã]o|nome(?:\s+do\s+artigo)?|bezeichnung)\b/i.test(l);
  return (hasRefOrPos && hasPartCol) || (hasPartCol && hasDescCol) || (hasRefOrPos && hasDescCol);
}
function hasCatalogSignature(t:string,hints:CatalogHints={}){
  if(/Husqvarna\s+Portal\b/i.test(t))return true;
  if(/portal\.husqvarnagroup\.com/i.test(t))return true;
  if(/printipl=true/i.test(t))return true;
  if(/\b(?:IPL|SPARE\s+PARTS(?:\s+LIST)?|PARTS\s+LIST|ILLUSTRATED\s+PARTS|LISTA\s+DE\s+PE[CÇ]AS|CAT[AÁ]LOGO\s+DE\s+PE[CÇ]AS)\b/i.test(t))return true;
  if(/\b(?:REF\.\s+PART\s+NO|KEY\s+PART|PART\s+NO\.\s+DESCRIPTION|N[uú]mero\s+do\s+artigo)\b/i.test(t))return true;
  if(/Kawasaki\s+Engine/i.test(t))return true;
  if(hints.filename && /\b(?:Husqvarna|Kawasaki|Kohler|Briggs|Honda|Roçadeira|Motosserra|Trator|Motor|Giro\s*Zero)\b/i.test(hints.filename))return true;
  return false;
}
function cleanPartNumber(v:string){return normalizedLine(v);}
function unique(values:string[]){return [...new Set(values.map(clean).filter(Boolean))];}

function legacyTextPages(text:string){const pages:Array<{page:number;text:string}>=[];let cursor=0,m:RegExpExecArray|null;LEGACY_PAGE_MARKER.lastIndex=0;while((m=LEGACY_PAGE_MARKER.exec(text))!==null){pages.push({page:Number(m[1]),text:text.slice(cursor,m.index).trim()});cursor=LEGACY_PAGE_MARKER.lastIndex;}return pages.filter(p=>Number.isInteger(p.page)&&p.page>0);}
function portalTextPages(text:string){const pages:Array<{page:number;text:string}>=[];let cursor=0,m:RegExpExecArray|null;PORTAL_PAGE_MARKER.lastIndex=0;while((m=PORTAL_PAGE_MARKER.exec(text))!==null){pages.push({page:Number(m[1]),text:text.slice(cursor,m.index).trim()});cursor=PORTAL_PAGE_MARKER.lastIndex;}return pages.filter(p=>Number.isInteger(p.page)&&p.page>0);}
function textPages(text:string){const p=portalTextPages(text);if(p.length)return p;const l=legacyTextPages(text);return l.length?l:[{page:1,text:text.trim()}];}

function isNoiseLine(v:string){
  const l=normalizedLine(v);
  if(!l||/^https?:\/\//i.test(l)||/Husqvarna\s+Portal\s+BR/i.test(l)||/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/.test(l))return true;
  if(/^(?:Refer[eê]ncia|N[uú]mero do artigo|Nome do artigo|Quanti\s*dade|Coment[aá]rio)$/i.test(l))return true;
  if(/^(?:Refer[eê]|ncia|N[uú]mero do|artigo|Nome do|Quanti|dade|Coment[aá]rio)$/i.test(l))return true;
  if(/^(?:KEY\s+PART|NO\.\s+NO\.\s+DESCRIPTION)/i.test(l))return true;
  if(/^\d{3}\s*\d{2}\s*\d{2}-$/.test(l))return true;
  return isPartsHeader(l);
}
function sectionFromLines(lines:string[],last:number,fallback:string){for(let i=lines.length-1;i>last;i--){const c=clean(lines[i]);if(c&&!isPartsHeader(c)&&!isNoiseLine(c))return c;}return fallback;}
function hasQuantityColumn(lines:string[]){return /\bqty\b|\bquantity\b|quanti\s*dade|\bquant\b/i.test(lines.join(' '));}
export function looksLikePartRowModel(v:string|null|undefined){const n=normalizedLine(clean(v).replace(/[\r\n]+/g,' '));return /^\d{1,3}\s+(?:\d{8,12}|\d{3}\s+\d{2}\s+\d{2}-\d{2})\s+\S+/i.test(n);}
export function looksLikeDescriptionModel(v:string|null|undefined){const n=comparable(clean(v).replace(/[\r\n]+/g,' '));if(!n)return false;if(/^(?:assy|assembly|kit|set|service\s+kit|conj(?:unto)?)\b/.test(n))return true;const words=n.split(/\s+/).filter(Boolean);return words.length>=3&&/\b(?:clutch|embreagem|muffler|silenciador|piston|pistao|cylinder|cilindro|gasket|junta|filter|filtro|carburettor|carburetor|carburador|housing|cobertura|sprayer)\b/.test(n);}
export function isPlausibleCatalogModel(value:string|null|undefined){
  const candidate=normalizedLine(clean(value).replace(/[\r\n]+/g,' '));
  if(!candidate||candidate.length>40)return false;
  if(!/^[A-Z0-9][A-Z0-9 .®_+/()-]*$/i.test(candidate))return false;
  if(!/\d/.test(candidate)&&!/\s/.test(candidate))return false;
  if(MODEL_NOISE.test(candidate)||looksLikePartRowModel(candidate)||looksLikeDescriptionModel(candidate))return false;
  const digits=candidate.replace(/\D/g,'');
  if(/^\d{9}$|^\d{11}$/.test(digits)&&!/[A-Z]/i.test(candidate))return false;
  return true;
}
export function normalizeHusqvarnaPnc(value:string|null|undefined){const digits=clean(value).replace(/\D/g,'');return /^9\d{8}(?:\d{2})?$/.test(digits)?digits:'';}
export function isLikelyHusqvarnaPnc(value:string|null|undefined){return Boolean(normalizeHusqvarnaPnc(value));}
export function inferCatalogModelFromFilename(filename:string){
  const base=filename.replace(/\.pdf$/i,'').replace(/[\u00a0\u202f]/g,' ').replace(/\s+/g,' ').trim();
  const candidate=clean(base.match(/Husqvarna\s+(.+)$/i)?.[1]||'');
  if(isPlausibleCatalogModel(candidate))return canonicalCatalogModel(candidate);

  let stripped=base.replace(/^(?:Cortador\s+de\s+grama(?:\s+giro\s+zero)?|Motor|Roçadeira|Motosserra|Trator(?:\s+cortador\s+de\s+grama)?|Soprador(?:\s+de\s+folhas(?:\s+costal)?)?|Aparador(?:\s+de\s+grama(?:\s+multifuncional)?|\s+de\s+cerca\s+viva)?|Podador(?:\s+de\s+galhos)?|Pulverizador|Perfurador|Cortadora(?:\s+de\s+disco)?|Engine|Chainsaw|Trimmer|Blower|Lawn\s*Mower)\s+/i,'');
  stripped=stripped.replace(/^(?:Husqvarna|Kawasaki|Kohler|Briggs\s*(?:&|and)\s*Stratton|Honda)\s+/i,'').trim();
  if(isPlausibleCatalogModel(stripped))return canonicalCatalogModel(stripped);

  const known=extractKnownHusqvarnaModel(candidate||base);
  return known&&/[A-Z]/i.test(known)&&isPlausibleCatalogModel(known)?known:'';
}
function canonicalCatalogModel(v:string){const n=clean(v);return /^\d{2,4}(?:\s+[A-Z0-9®.-]+)+$/i.test(n)?compactModel(n):n;}
function portalModel(text:string){
  const husqHeader=text.match(/Husqvarna\s+([A-Z0-9][A-Z0-9 .®_-]{0,50}?)\s+Husqvarna\s*\|\s*Husqvarna\s+Portal\s+BR/i)?.[1];
  if(husqHeader)return canonicalCatalogModel(husqHeader);
  const kawHeader=text.match(/Kawasaki\s+Engine(?:\s+\([^)]+\))?\s+([A-Z0-9][A-Z0-9 .®_-]{0,50}?)\s*\|\s*Husqvarna\s+Portal\s+BR/i)?.[1];
  if(kawHeader)return canonicalCatalogModel(kawHeader);
  const slug=text.match(/https?:\/\/portal\.husqvarnagroup\.com\/br\/[^\s?]+\/[^\s/?]*(?:husqvarna|kawasaki-engine-(?:for-[a-z]+-)?)([a-z0-9-]+)\/?\?printipl=true/i)?.[1];
  return slug?canonicalCatalogModel(slug.replace(/-/g,' ').toUpperCase()):'';
}
function detectModel(text:string,hints:CatalogHints){
  const portal=portalModel(text);if(isPlausibleCatalogModel(portal))return portal;
  const ipl=text.match(/IPL,\s*([^,\n]+),\s*\d{4}-\d{2}/i)?.[1];if(isPlausibleCatalogModel(ipl))return canonicalCatalogModel(clean(ipl));
  const model=text.match(/MODEL\s+NUMBER\s*:?\s*([A-Z0-9][A-Z0-9 .®_-]*?)(?=\s*\(|\s+MFG\.|\r?\n|$)/i)?.[1];if(isPlausibleCatalogModel(model))return canonicalCatalogModel(clean(model));
  const product=text.match(/^\s*([A-Z0-9]{1,8}(?:\s+[A-Z0-9®.-]{1,10}){0,2})\s+(?:LAWN\s+MOWER|CHAIN\s+SAW|CHAINSAW|TRACTOR|BLOWER|TRIMMER|BRUSHCUTTER|ENGINE|SPRAYER|POLE\s+SAW|HEDGE\s+TRIMMER)\b/im)?.[1];if(isPlausibleCatalogModel(product))return canonicalCatalogModel(clean(product));
  const hinted=clean(hints.model);if(isPlausibleCatalogModel(hinted))return canonicalCatalogModel(hinted);
  return inferCatalogModelFromFilename(clean(hints.filename));
}
function detectManufacturer(text:string,hints:CatalogHints){
  if(hints.manufacturer&&clean(hints.manufacturer))return clean(hints.manufacturer);
  const combined=`${hints.filename||''} ${text.slice(0,4000)}`;
  if(/\bKawasaki\b/i.test(combined))return 'Kawasaki';
  if(/\bKohler\b/i.test(combined))return 'Kohler';
  if(/\bBriggs\s*(?:&|and)\s*Stratton\b/i.test(combined))return 'Briggs & Stratton';
  if(/\bHonda\b/i.test(combined))return 'Honda';
  return 'Husqvarna';
}
function collectPncs(text:string,hints:CatalogHints){const v:string[]=[];const hinted=normalizeHusqvarnaPnc(hints.pnc);if(hinted)v.push(hinted);for(const m of text.matchAll(/MFG\.\s*ID\.\s*NUMBER\s*:?\s*(\d{11}|\d{9})\b/gi))v.push(m[1]);for(const m of text.matchAll(/(?:PNC|PRODUCT\s+(?:NO|NUMBER|NUMBER\s+CODE))\s*:?\s*(\d{11}|\d{9})\b/gi))v.push(m[1]);for(const m of text.matchAll(/\bFor(?:\s+all+\s+EXCEPT)?\s+([^\n.]+)/gi))v.push(...(m[1].match(PNC_PATTERN)||[]));return unique(v.map(normalizeHusqvarnaPnc).filter(Boolean));}
function applicationForBlock(block:string,known:string[],hinted:string){const ex=block.match(/\bFor\s+all+\s+EXCEPT\s+([^\n.]+)/i);if(ex){const excluded=new Set((ex[1].match(PNC_PATTERN)||[]).map(normalizeHusqvarnaPnc).filter(Boolean));return{pncs:unique(known.filter(p=>!excluded.has(p))),universal:false};}const direct=block.match(/\bFor\s+([^\n.]+)/i);if(direct){const p=unique((direct[1].match(PNC_PATTERN)||[]).map(normalizeHusqvarnaPnc).filter(Boolean));if(p.length)return{pncs:p,universal:false};}if(hinted)return{pncs:[hinted],universal:false};return{pncs:[],universal:true};}
function applicationClause(v:string){const ex=v.match(/\bFor\s+all+\s+EXCEPT\s+([^\n.]+)/i);if(ex&&(ex[1].match(PNC_PATTERN)||[]).length)return`For all EXCEPT ${ex[1].trim()}`;const d=v.match(/\bFor\s+([^\n.]+)/i);return d&&(d[1].match(PNC_PATTERN)||[]).length?`For ${d[1].trim()}`:'';}
function displayNameWithoutApplication(v:string){const n=normalizedLine(v);return clean(n.match(/^(.*?)(?:\s+\d{1,3})?\s+For(?:\s+all+\s+EXCEPT)?\s+[^\n.]*\b(?:\d{11}|\d{9})\b[^\n.]*$/i)?.[1]||n);}

function splitInlineQuantity(v:string){const m=normalizedLine(v).match(/^(.*\S)\s+(\d{1,3})(?:\s+(.+))?$/);return m?{description:clean(m[1]),quantity:m[2],trailing:clean(m[3])}:null;}
function parseFlexibleBlock(lines:string[],expects:boolean){if(!expects)return{name:normalizedLine(lines.filter(l=>!isNoiseLine(l)).join(' ')),quantity:'',comments:''};const description:string[]=[],comments:string[]=[];let quantity='',after=false;for(const raw of lines){const line=normalizedLine(raw);if(!line||isNoiseLine(line))continue;if(after){comments.push(line);continue;}const q=line.match(/^(\d{1,3})(?:\s+(.+))?$/);if(q){quantity=q[1];if(q[2])comments.push(q[2]);after=true;continue;}const inline=splitInlineQuantity(line);if(inline){if(inline.description)description.push(inline.description);quantity=inline.quantity;if(inline.trailing)comments.push(inline.trailing);after=true;continue;}description.push(line);}return{name:normalizedLine(description.join(' ')),quantity,comments:normalizedLine(comments.join(' '))};}

type ParsedRow={position:string;partNumber:string;name:string;quantity:string;comments:string;sectionCode:string};
function isPncListMisreadAsPart(row:ParsedRow,knownPncs:string[]){const code=normalizeHusqvarnaPnc(row.partNumber);if(!code||!knownPncs.includes(code))return false;const evidence=comparable([row.name,row.comments].filter(Boolean).join(' ')).replace(/\b\d{9,11}\b/g,'').replace(/[^a-z]+/g,' ').trim(),compact=evidence.replace(/\s+/g,'');if(compact.length<3)return true;return /^(?:(?:north|south|latin)america(?:n)?|europe(?:an)?|usa?|canada|canadian|australia(?:n)?|newzealand|global|export)models?$/.test(compact);}
function parseLegacyPage(lines:string[]):{rows:ParsedRow[];section:string}|null{if(!lines.some(isPartsHeader))return null;const rows:Array<ParsedRow&{index:number}>=[];lines.forEach((line,index)=>{const full=HUSQVARNA_ROW.exec(line);const generic=full?null:GENERIC_PART_ROW.exec(line);const m=full||generic;if(!m)return;const has=Boolean(full);rows.push({index,position:m[1],partNumber:cleanPartNumber(m[2]),name:clean(m[3]),sectionCode:has?m[4].toUpperCase():'',quantity:has?m[5]:m[4],comments:clean(has?m[6]:m[5])});});if(!rows.length)return null;return{rows,section:sectionFromLines(lines,rows[rows.length-1].index,rows[0].sectionCode||'Peças')};}
type FlexibleRowStart={index:number;contentIndex:number;position:string;partNumber:string;remainder:string};
function flexibleRowStarts(lines:string[]):FlexibleRowStart[]{const starts:FlexibleRowStart[]=[];for(let i=0;i<lines.length;i++){const direct=FLEXIBLE_ROW_START.exec(lines[i]);if(direct){starts.push({index:i,contentIndex:i,position:direct[1],partNumber:cleanPartNumber(direct[2]),remainder:clean(direct[3])});continue;}const pos=lines[i].match(/^(\d{1,3}[A-Za-z]?(?:[-.]\d{1,2})?)$/);if(!pos||i+1>=lines.length)continue;const split=PART_NUMBER_ONLY.exec(lines[i+1]);if(!split)continue;starts.push({index:i,contentIndex:i+1,position:pos[1],partNumber:cleanPartNumber(split[1]),remainder:clean(split[2])});i++;}return starts;}
function parseFlexiblePage(lines:string[]):{rows:ParsedRow[];section:string}|null{const starts=flexibleRowStarts(lines);if(!starts.length)return null;const expects=hasQuantityColumn(lines),rows:ParsedRow[]=[];for(let i=0;i<starts.length;i++){const cur=starts[i],next=starts[i+1]?.index??lines.length;const parsed=parseFlexibleBlock([cur.remainder,...lines.slice(cur.contentIndex+1,next)],expects);if(!parsed.name)continue;rows.push({position:cur.position,partNumber:cur.partNumber,name:parsed.name,quantity:parsed.quantity,comments:parsed.comments,sectionCode:''});}return rows.length?{rows,section:'Peças'}:null;}
function isGenericSection(v:string){return GENERIC_SECTIONS.has(comparable(v));}
function technicalSectionFromPage(text:string){for(const line of text.split(/\r?\n/).map(normalizedLine).filter(Boolean)){if(isNoiseLine(line)||!TECHNICAL_SECTION_PATTERN.test(line)||FLEXIBLE_ROW_START.test(line)||line.length>90)continue;const letters=line.replace(/[^A-Za-z]/g,'');if(!letters)continue;const upper=letters.replace(/[^A-Z]/g,'');if(upper.length/letters.length>=.8)return line;}return'';}

export function parseHusqvarnaIplText(text:string,hints:CatalogHints={}):CatalogExtraction|null{
  if(!hasCatalogSignature(text,hints))return null;const model=detectModel(text,hints),manufacturer=detectManufacturer(text,hints);if(!model||!manufacturer)return null;
  const hintedPnc=normalizeHusqvarnaPnc(hints.pnc),knownPncs=collectPncs(text,hints),parts:ExtractedPart[]=[];const pages=textPages(text),sectionHints=pages.map(p=>technicalSectionFromPage(p.text));
  for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
    const page=pages[pageIndex],lines=page.text.split(/\r?\n/).map(normalizedLine).filter(Boolean),parsed=parseLegacyPage(lines)||parseFlexiblePage(lines);if(!parsed)continue;
    const inferred=inferCatalogSection(parsed.rows);const section=isGenericSection(parsed.section)?(sectionHints[pageIndex]||sectionHints[pageIndex-1]||inferred||parsed.section):parsed.section;
    for(const row of parsed.rows){if(isPncListMisreadAsPart(row,knownPncs))continue;const evidence=[row.name,row.comments].filter(Boolean).join(' '),application=applicationForBlock(evidence,knownPncs,hintedPnc),clause=applicationClause(evidence),rowName=displayNameWithoutApplication(row.name);const notes=[row.quantity?`Quantidade: ${row.quantity}`:'',row.comments,clause&&!row.comments.includes(clause)?clause:'',row.sectionCode?`Seção do catálogo: ${row.sectionCode}`:''].filter(Boolean).join('. ');
      if(application.pncs.length){for(const pnc of application.pncs)parts.push({manufacturer,model,pnc,universalAcrossPnc:false,section,position:row.position,name:rowName,alternativeNames:[],partNumber:row.partNumber,page:page.page,notes});}
      else parts.push({manufacturer,model,pnc:'',universalAcrossPnc:application.universal,section,position:row.position,name:rowName,alternativeNames:[],partNumber:row.partNumber,page:page.page,notes});
    }
  }
  const deduped=[...new Map(parts.map(p=>[[p.model,p.pnc,p.page,p.section,p.position,p.partNumber].join('|'),p])).values()];const occurrences=new Set(deduped.map(p=>[p.page,p.position,p.partNumber].join('|'))).size;if(occurrences<10)return null;return{manufacturer,models:[model],pncs:knownPncs,parts:deduped};
}

export async function extractCatalogDeterministically(filePath:string,hints:CatalogHints={}):Promise<DeterministicExtraction|null>{const parser=new PDFParse({data:await readFile(filePath)});try{const result=await parser.getText();const extraction=parseHusqvarnaIplText(result.text,hints);return extraction?{extraction,method:'HUSQVARNA_IPL_TEXT'}:null;}finally{await parser.destroy();}}
