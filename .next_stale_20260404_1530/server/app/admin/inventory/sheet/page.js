(()=>{var e={};e.id=2023,e.ids=[2023],e.modules={72934:e=>{"use strict";e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{"use strict";e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{"use strict";e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},78893:e=>{"use strict";e.exports=require("buffer")},17702:e=>{"use strict";e.exports=require("events")},76162:e=>{"use strict";e.exports=require("stream")},21764:e=>{"use strict";e.exports=require("util")},88106:(e,t,a)=>{"use strict";a.r(t),a.d(t,{GlobalError:()=>l.a,__next_app__:()=>p,originalPathname:()=>u,pages:()=>c,routeModule:()=>g,tree:()=>d}),a(5776),a(84746),a(15051),a(35866);var r=a(23191),i=a(88716),n=a(37922),l=a.n(n),o=a(95231),s={};for(let e in o)0>["default","tree","pages","GlobalError","originalPathname","__next_app__","routeModule"].indexOf(e)&&(s[e]=()=>o[e]);a.d(t,s);let d=["",{children:["admin",{children:["inventory",{children:["sheet",{children:["__PAGE__",{},{page:[()=>Promise.resolve().then(a.bind(a,5776)),"C:\\Users\\dylan\\Downloads\\ODD_WHEELS_POS_UPDATED\\JANUARY 15 - ODD WHEELS POS\\app\\admin\\inventory\\sheet\\page.tsx"]}]},{}]},{}]},{layout:[()=>Promise.resolve().then(a.bind(a,84746)),"C:\\Users\\dylan\\Downloads\\ODD_WHEELS_POS_UPDATED\\JANUARY 15 - ODD WHEELS POS\\app\\admin\\layout.tsx"],metadata:{icon:[],apple:[],openGraph:[],twitter:[],manifest:"/manifest.webmanifest"}}]},{layout:[()=>Promise.resolve().then(a.bind(a,15051)),"C:\\Users\\dylan\\Downloads\\ODD_WHEELS_POS_UPDATED\\JANUARY 15 - ODD WHEELS POS\\app\\layout.tsx"],"not-found":[()=>Promise.resolve().then(a.t.bind(a,35866,23)),"next/dist/client/components/not-found-error"],metadata:{icon:[],apple:[],openGraph:[],twitter:[],manifest:"/manifest.webmanifest"}}],c=["C:\\Users\\dylan\\Downloads\\ODD_WHEELS_POS_UPDATED\\JANUARY 15 - ODD WHEELS POS\\app\\admin\\inventory\\sheet\\page.tsx"],u="/admin/inventory/sheet/page",p={require:a,loadChunk:()=>Promise.resolve()},g=new r.AppPageRouteModule({definition:{kind:i.x.APP_PAGE,page:"/admin/inventory/sheet/page",pathname:"/admin/inventory/sheet",bundlePath:"",filename:"",appPaths:[]},userland:{loaderTree:d}})},55985:(e,t,a)=>{Promise.resolve().then(a.bind(a,21529))},33217:(e,t,a)=>{Promise.resolve().then(a.bind(a,40592)),Promise.resolve().then(a.bind(a,46080)),Promise.resolve().then(a.bind(a,22939))},21529:(e,t,a)=>{"use strict";a.r(t),a.d(t,{default:()=>eD});var r=a(10326),i=a(17577),n=a(8903),l=a(21021),o=a(85833),s=a(3679),d=a(97139),c=a(86542),u=a(62194),p=a(87361),g=a(41335),h=a(36016),f=a(95625);let m=4/3,b="New Arrival",x=null,w=null;function y(e){let t=e.product?.brand??"";return(0,g.oI)(t)||((0,g.rX)(e.product?.title??"").brand??"Unknown")}let v=new Set(["Mini GT","Kaido House","Pop Race","Tarmac","Tarmac Works","TLVN","TLV-N","Tomica Limited Vintage","Tomica Limited Vintage Neo","Masdi","XCarToys","X Car Toys"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),S=new Set(["Masdi","XCarToys","X Car Toys"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),C=new Set(["Kaido House","Pop Race"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),N=new Set(["Mini GT","MiniGT"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),k=new Set(["Tomica","Takara Tomy","Takara Tomy Tomica"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),j=new Set(["Hot Wheels","Hot Wheels Premium"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),_=new Set(["Inno64","Inno 64"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),E=new Set(["Kaido House","Kaido"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),L=new Set(["Pop Race","Poprace"].map(e=>e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())),P=[b,"Truescales JDM","Truescales EUR/US","Mini GT JDM","Mini GT EUR/US","Inno64","Kaido House","Pop Race","Boxed Truescales","Blistered Truescales","Figures and Dioramas","Tomica","Hot Wheels","Trucks","Others"];function R(e){return e.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}let T=new Set(["Toyota","Nissan","Honda","Mazda","Subaru","Mitsubishi","Lexus","Infiniti","Suzuki","Isuzu"].map(e=>e.toLowerCase())),U=[/\bsupra\b/i,/\bskyline\b/i,/\bg\s*t\s*-?\s*r\b/i,/\bcivic\b/i,/\bcrx\b/i,/\bdel\s*sol\b/i,/\bintegra\b/i,/\bnsx\b/i,/\bs2000\b/i,/\bs660\b/i,/\btype\s*r\b/i,/\bsilvia\b/i,/\b180\s*sx\b/i,/\b200\s*sx\b/i,/\b240\s*sx\b/i,/\bae86\b/i,/\btrueno\b/i,/\blevin\b/i,/\bgt\s*-?\s*86\b/i,/\bgr\s*-?\s*86\b/i,/\brx\s*-?\s*7\b/i,/\brx\s*-?\s*8\b/i,/\bmazdaspeed\b/i,/\bmx\s*-?\s*5\b/i,/\bmiata\b/i,/\bmr\s*-?\s*2\b/i,/\bchaser\b/i,/\bcresta\b/i,/\bmark\s*ii\b/i,/\baristo\b/i,/\bsoarer\b/i,/\bcelsior\b/i,/\bcrown\b/i,/\bcentury\b/i,/\bhiace\b/i,/\balphard\b/i,/\bvellfire\b/i,/\bfairlady\b/i,/\bz\s*(?:32|33|34)\b/i,/\b(?:z32|z33|z34)\b/i,/\bimpreza\b/i,/\bwrx\b/i,/\bsti\b/i,/\bevo\b/i,/\bevolution\b/i,/\b(?:r32|r33|r34|r35)\b/i,/\b(?:s13|s14|s15)\b/i,/\b(?:bnr32|bnr33|bnr34)\b/i,/\b(?:jzx90|jzx100|jzx110)\b/i,/\b(?:fc3s|fd3s|sa22)\b/i];function $(e){let t=String(eu(e).make??"").toLowerCase();if(t&&T.has(t))return!0;let a=(0,g.TH)(e.product?.title??""),r=`${e.product?.model??""} ${e.product?.variation??""}`,i=`${a} ${r}`.replace(/[^a-z0-9]+/gi," ").replace(/\s+/g," ").trim();return!!/\bjdm\b/i.test(i)||function(e){if(!e)return!1;let t=String(e??"").replace(/[^a-z0-9]+/gi," ").replace(/\s+/g," ").trim();return U.some(e=>e.test(t))}(i)}function A(e){let t=function(e){let t=e.created_at??e.product?.created_at,a=t?new Date(t).getTime():NaN;return Number.isFinite(a)?a:null}(e);return!!t&&Date.now()-t<=432e6}function M(e){let t=String(e.ship_class??"").toUpperCase().trim(),a=R(y(e));if(_.has(a))return"Inno64";if(E.has(a))return"Kaido House";if(L.has(a))return"Pop Race";let r="Others";if(t&&"UNASSIGNED"!==t&&("ACRYLIC_TRUE_SCALE"===t?r="Truescales":"MINI_GT"===t?r="Mini GT":"BLISTER"===t?r="Blistered Truescales":"FIGURES_DIORAMA"===t?r="Figures and Dioramas":"TRUCKS"===t&&(r="Trucks"),("HOT_WHEELS_MAINLINE"===t||"HOT_WHEELS_PREMIUM"===t)&&(r="Hot Wheels")),("Truescales"===r||"Boxed Truescales"===r||"Others"===r)&&N.has(a)&&(r="Mini GT"),"Others"===r&&(v.has(a)?r="Boxed Truescales":k.has(a)?r="Tomica":j.has(a)&&(r="Hot Wheels")),"Truescales"===r||"Boxed Truescales"===r||"Mini GT"===r){if("Truescales"===r&&S.has(a)&&(r="Boxed Truescales"),"Mini GT"===r)return`${r} ${$(e)?"JDM":"EUR/US"}`;if("Truescales"===r)return C.has(a)?r:`${r} ${$(e)?"JDM":"EUR/US"}`}return r}function z(e){let t=M(e)||"Others";return A(e)?Array.from(new Set([b,t,function(e){let t=R(y(e));return _.has(t)?"Inno64":E.has(t)?"Kaido House":L.has(t)?"Pop Race":k.has(t)?"Tomica":j.has(t)?"Hot Wheels":N.has(t)?`Mini GT ${$(e)?"JDM":"EUR/US"}`:null}(e)].filter(Boolean))):[t]}function I(e,t){return!t||"ALL"===t||z(e).includes(t)}function O(e){return e?e.trim().toLowerCase()===b.toLowerCase()?e:`${e} Collection`:"Collection"}function D(e,t){return t&&"ALL"!==t?e.filter(e=>I(e,t)):e}function B(e){return Number(e.qty??0)>0}let W=["Mini GT","Kaido House","Inno64","Tarmac","Tarmac Works","POP RACE","Pop Race","Hot Wheels","Tomica","BMC","GCD","Focal Horizon","Street Warrior","Street Weapon","StreetWeapon","Howie","Howie Model","Para64","Para 64","Auto World","Greenlight","Johnny Lightning","M2 Machines","Matchbox","Majorette","Kyosho","Welly","Maisto"],H=[],Z=new Set(["black","white","silver","grey","gray","red","blue","green","yellow","orange","purple","pink","gold","brown","beige","tan","chrome","matte","carbon","metallic","pearl"]);function G(e){let t=String(e??"").toLowerCase();if(!t)return!1;if(Z.has(t))return!0;let a=t.split(/[^a-z]+/).filter(Boolean);return a.length>0&&a.every(e=>Z.has(e))}let F=new Set(["DIECAST","MODEL","CAR","SCALE","EDITION","LIMITED","EXCLUSIVE","VERSION","VER","RESERVE","CHASE","SET","SERIES","COLLECTION","WITH","W","W/","RHD","LHD"]),q=new Set(["GT","GTR","GT-R","GTS","GTO","RS","RSR","AMG","LBWK","LB","RWB","JDM","EVO","NSX","ZL1","ZR1","TRD","STI","TYPE","TYPE-R","TYPE-S","V6","V8","V10","V12","FD","FC","EK9","EG6","DC2","S15","S13","S14","AE86","R32","R33","R34"]),V=[{canonical:"Toyota",aliases:["toyota","trd"]},{canonical:"Nissan",aliases:["nissan","nismo"]},{canonical:"Honda",aliases:["honda"]},{canonical:"Mazda",aliases:["mazda"]},{canonical:"Subaru",aliases:["subaru"]},{canonical:"Mitsubishi",aliases:["mitsubishi","mitsubushi"]},{canonical:"Lexus",aliases:["lexus"]},{canonical:"Acura",aliases:["acura"]},{canonical:"Infiniti",aliases:["infiniti"]},{canonical:"Suzuki",aliases:["suzuki"]},{canonical:"Isuzu",aliases:["isuzu"]},{canonical:"Kia",aliases:["kia"]},{canonical:"Hyundai",aliases:["hyundai"]},{canonical:"Genesis",aliases:["genesis"]},{canonical:"BMW",aliases:["bmw"]},{canonical:"Mercedes-Benz",aliases:["mercedes","mercedes-benz","benz"]},{canonical:"Audi",aliases:["audi"]},{canonical:"Volkswagen",aliases:["volkswagen","vw"]},{canonical:"Porsche",aliases:["porsche"]},{canonical:"Ferrari",aliases:["ferrari"]},{canonical:"Lamborghini",aliases:["lamborghini","lambo"]},{canonical:"McLaren",aliases:["mclaren","mc laren"]},{canonical:"Aston Martin",aliases:["aston martin","astonmartin"]},{canonical:"Bentley",aliases:["bentley"]},{canonical:"Rolls-Royce",aliases:["rolls-royce","rolls royce"]},{canonical:"Jaguar",aliases:["jaguar"]},{canonical:"Land Rover",aliases:["land rover","landrover","range rover"]},{canonical:"Mini",aliases:["mini cooper","mini"]},{canonical:"Alfa Romeo",aliases:["alfa romeo","alfaromeo"]},{canonical:"Fiat",aliases:["fiat"]},{canonical:"Maserati",aliases:["maserati"]},{canonical:"Lotus",aliases:["lotus"]},{canonical:"Pagani",aliases:["pagani"]},{canonical:"Bugatti",aliases:["bugatti"]},{canonical:"Koenigsegg",aliases:["koenigsegg"]},{canonical:"Peugeot",aliases:["peugeot"]},{canonical:"Renault",aliases:["renault"]},{canonical:"Citroen",aliases:["citroen"]},{canonical:"Skoda",aliases:["skoda"]},{canonical:"Seat",aliases:["seat"]},{canonical:"Opel",aliases:["opel"]},{canonical:"Vauxhall",aliases:["vauxhall"]},{canonical:"Lancia",aliases:["lancia"]},{canonical:"Volvo",aliases:["volvo"]},{canonical:"Saab",aliases:["saab"]},{canonical:"Tesla",aliases:["tesla"]},{canonical:"Chevrolet",aliases:["chevrolet","chevy"]},{canonical:"Ford",aliases:["ford"]},{canonical:"Dodge",aliases:["dodge"]},{canonical:"Chrysler",aliases:["chrysler"]},{canonical:"Jeep",aliases:["jeep"]},{canonical:"Cadillac",aliases:["cadillac"]},{canonical:"GMC",aliases:["gmc"]},{canonical:"Hummer",aliases:["hummer"]},{canonical:"Ram",aliases:["ram"]}].flatMap(e=>e.aliases.map(t=>({canonical:e.canonical,alias:t,pattern:RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\\s+/g,"\\s+").replace(/-/g,"[-\\s]?")}\\b`,"i"),length:t.length}))).sort((e,t)=>t.length-e.length),J=new Map;function X(e,t=[]){let a=String(e??"");for(let e of Array.from(new Set([...Array.from(new Set([...H,...W].filter(Boolean))),...t])).filter(Boolean)){let t=RegExp(`\\b${e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\\s+/g,"\\s+").replace(/-/g,"[-\\s]?")}\\b`,"ig");a=a.replace(t," ")}return a.replace(/\s{2,}/g," ").trim()}function Y(e){let t=e.product?.title??"";return ec((0,g.TH)(t).trim())||"Untitled"}function K(e){let t=new Map;for(let a of e){let e=a.product?.id?`product:${a.product.id}`:`row:${a.id}`,r=t.get(e);r?r.push(a):t.set(e,[a])}let a=[];for(let e of t.values()){let t=e[0],r=null,i=null,n=0,l=!1;for(let t of e)"number"!=typeof t.price||Number.isNaN(t.price)||(r=null===r?t.price:Math.min(r,t.price),i=null===i?t.price:Math.max(i,t.price)),"number"!=typeof t.qty||Number.isNaN(t.qty)||(n+=t.qty,l=!0);a.push({...t,price_min:r,price_max:i,qty_total:l?n:null,variant_count:e.length})}return a}function Q(e){let t=e.price_min,a=e.price_max;if(null===t&&null===a)return"-";if(null!==t&&null!==a&&t!==a)return`${(0,c.S)(t)} - ${(0,c.S)(a)}`;let r=t??a;return null===r?"-":(0,c.S)(r)}function ee(e){return e.variant_count>1?"MULTI VARIANTS":ev(e.condition)}function et(e){return(0,f.xN)(e.product?.special_tags)}function ea(e){let t=et(e).map(e=>(0,f.yU)(e));return t.length?t.join(" | "):"-"}function er(e){return"more"===e?"product-tag product-tag--more":`product-tag product-tag--${e.replace(/_/g,"-")}`}function ei(e,t={}){let a=et(e);if(!a.length)return"";let r=Math.max(1,t.maxVisible??a.length),i=a.slice(0,r),n=a.length-i.length,l=i.map(e=>`<span class="${er(e)}"><span class="product-tag__dot"></span><span class="product-tag__label">${eN((0,f.yU)(e))}</span></span>`);n>0&&l.push(`<span class="${er("more")}"><span class="product-tag__dot"></span><span class="product-tag__label">+${n} more</span></span>`);let o=t.containerClassName??"product-tags";return`<div class="${o}">${l.join("")}</div>`}function en(){let e=f.ob.map(e=>{let t=(0,f.Kq)(e.key);return`
      .product-tag--${e.key.replace(/_/g,"-")} {
        background: linear-gradient(135deg, ${t.gradientStart}, ${t.gradientEnd});
        border-color: ${t.borderColor};
        color: ${t.textColor};
        box-shadow: 0 10px 20px ${t.glowColor};
      }
    `}).join("\n");return`
    ${e}
    .product-tag--more {
      background: linear-gradient(135deg, #394150, #1f2937);
      border-color: rgba(255,255,255,0.35);
      color: #ffffff;
      box-shadow: 0 10px 20px rgba(17,24,39,0.34);
    }
  `}function el(e){return(e??[]).map(e=>({...e,product:Array.isArray(e.product)?e.product[0]??null:e.product??null}))}let eo=new Set(["SCALE","DIECAST","MODEL","CAR","IN","BOX","EBAY","EXCLUSIVE","LIMITED","EDITION","LHD","RHD"]),es=new Set(["GT","GTR","GT-R","GTS","GTO","RS","RSR","AMG","LBWK","LB","RWB","JDM","EVO","NSX","ZL1","ZR1","TRD"]);function ed(e,t){let a=(0,g.TH)(e||"").trim();if(!a)return"Unknown";let r=(a=(a=(a=(a=(a=a.replace(/\[[^\]]+\]|\([^)]*\)/g," ")).replace(/[,|]/g," ")).replace(/\b1\s*[:/]\s*\d+\b/gi," ")).replace(/\b1\s*-\s*\d+\b/gi," ")).replace(/\s+/g," ").trim()).split(/\s+/).filter(Boolean),i=t.split(/\s+/).map(e=>e.trim()).filter(Boolean);if(i.length&&r.length>=i.length){let e=r.slice(0,i.length).map(e=>e.toLowerCase()),t=i.map(e=>e.toLowerCase());e.join(" ")===t.join(" ")&&(r=r.slice(i.length))}for(;r.length;){let e=r[0];if(/^[A-Z0-9]+[-/][A-Z0-9]+$/i.test(e)||/^\d{4,}[A-Z-]*$/i.test(e)){r.shift();continue}break}if(!(r=r.filter(e=>{if(!e)return!1;let t=e.toUpperCase();return!(eo.has(t)||/^(19|20)\d{2}$/.test(e)||/^1[:/-]\d+$/i.test(e))})).length)return"Unknown";let n=e=>{if(!e)return"";let t=e.toUpperCase();return/[0-9]/.test(e)||es.has(t)||e.length<=2?t:e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()};return r.map(e=>{let t=e.split(/[-/]/),a=e.match(/[-/]/g)??[],r=t.map(n),i="";for(let e=0;e<r.length;e+=1)i+=r[e],a[e]&&(i+=a[e]);return i}).join(" ").trim()||"Unknown"}function ec(e){let t=String(e??"");for(let e of[/\bdiecast\s+car\s+models?\b/gi,/\bdiecast\s+model\s+cars?\b/gi,/\bdiecast\s+models?\b/gi,/\bdiecast\s+cars?\b/gi,/\bdiecast\s+model\b/gi,/\bmodel\s+cars?\b/gi,/\bcar\s+models?\b/gi])t=t.replace(e," ");return(t=(t=t.replace(/\(\s*\)/g," ")).replace(/\[\s*\]/g," ")).replace(/\s{2,}/g," ").trim()}function eu(e){let t=e.id||e.product?.id||"";if(t&&J.has(t))return J.get(t);let a=(0,g.TH)(e.product?.title??""),r=[e.product?.model??"",e.product?.variation??""].filter(Boolean).join(" "),i=[e.product?.brand??""].filter(Boolean),n=X(`${a} ${r}`.trim(),i),l=n.toLowerCase(),o=null,s=null;for(let e of V)if(e.pattern.test(l)){o=e.canonical,s=e.pattern;break}let d=n;if(s&&"Land Rover"===o&&/range\\s+rover/i.test(s.source)&&(s=/\\bland\\s+rover\\b/i.test(n)?/\bland\s+rover\b/i:null),s){let e=RegExp(s.source,"ig");d=d.replace(e," ")}let c=(d=d.replace(/\[[^\]]+\]|\([^)]*\)/g," ").replace(/\b1\s*[:/]\s*\d+\b/gi," ").replace(/\b1\s*-\s*\d+\b/gi," ").replace(/\bscale\b/gi," ").replace(/[,|]/g," ").replace(/\s{2,}/g," ").trim()).split(/\s+/).filter(Boolean);for(;c.length;){let e=c[0];if(!e||G(e)){c.shift();continue}let t=e.toUpperCase();if(F.has(t)||/^(19|20)\d{2}$/.test(e)||/^\d{4,}[A-Z-]*$/i.test(e)){c.shift();continue}break}let u=[];for(let e of c){if(!e)continue;let t=e.toUpperCase();if(F.has(t)||G(e)||(u.push(e),u.length>=8))break}let p=u.filter(Boolean),h=[];for(let e of p){let t=h[h.length-1];t&&t.toLowerCase()===e.toLowerCase()||h.push(e)}if((p=h).length>1&&p.length%2==0){let e=p.length/2,t=p.slice(0,e),a=p.slice(e);t.every((e,t)=>e.toLowerCase()===a[t]?.toLowerCase())&&(p=t)}let f=p.join(" ").trim();f||(f=ed(e.product?.model??(0,g.rX)(e.product?.title??"").model??"",o??"")),o&&f.toLowerCase().startsWith(o.toLowerCase())&&(f=f.slice(o.length).trim());let m=e=>{if(!e)return"";let t=e.toUpperCase();return/[0-9]/.test(e)||q.has(t)||e.length<=2?t:e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()},b={make:o??"Unknown",model:(f?f.split(/\s+/).map(e=>{let t=e.split(/[-/]/),a=e.match(/[-/]/g)??[],r=t.map(m),i="";for(let e=0;e<r.length;e+=1)i+=r[e],a[e]&&(i+=a[e]);return i}).join(" ").trim():"Unknown")||"Unknown"};return t&&J.set(t,b),b}function ep(e){return eu(e).make||"Unknown"}function eg(e){return eu(e).model||"Unknown"}function eh(e){let t=eu(e),a=t.make||"Unknown",r=t.model||"Unknown";return"Unknown"===a?r:"Unknown"===r?a:r.toLowerCase().startsWith(a.toLowerCase())?r:`${a} ${r}`.trim()}function ef(e){return String(e??"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean)}function em(e,t){let a=new Set(ef(e)),r=ef(t);return!!r.length&&r.every(e=>a.has(e))}function eb(e){return String(e??"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}function ex(e){return e.toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}function ew(e){return(0,h.Js)(e,{upper:!0})}let ey={sealed:"SEALED",sealed_unsealed:"SEALED/UNSEALED",resealed:"RESEAL",near_mint:"NEAR MINT",unsealed:"UNSEAL",with_issues:"ISSUES",sealed_blister:"BLISTER",unsealed_blister:"BLISTER",blistered:"BLISTER"};function ev(e){return ey[String(e??"").toLowerCase()]??ew(e)}function eS(e){return String(e??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}function eC(e){let t=String(e??"");return/[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t}function eN(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function ek(e,{width:t=200,height:a=200,quality:r=65,format:i="webp",resize:n="contain"}={}){return e?(0,u.O1)(e,{width:t,height:a,quality:r,format:i,resize:n}):e}function ej(e){let t=eE(e);return t?[t.src]:[]}function e_(e){return ej(e).length>0}function eE(e){let t=String(e.product?.image_urls?.[0]??"").trim();if(!t)return null;let a=(0,p.Bd)(t);return{rawUrl:t,src:a.src,crop:a.crop}}function eL(e,t,a,r,i,n){let l=Math.min(n,r/2,i/2);e.beginPath(),e.moveTo(t+l,a),e.arcTo(t+r,a,t+r,a+i,l),e.arcTo(t+r,a+i,t,a+i,l),e.arcTo(t,a+i,t,a,l),e.arcTo(t,a,t+r,a,l),e.closePath()}function eP(e,t,a,r,i){let n=function(e,t,a){if(!t)return 0;let r=0;for(let i=0;i<t.length;i+=1)r+=e.measureText(t[i]).width,i<t.length-1&&(r+=a);return r}(e,t,i);!function(e,t,a,r,i){let n=a;for(let a=0;a<t.length;a+=1){let l=t[a];e.fillText(l,n,r),n+=e.measureText(l).width+i}}(e,t,a-n/2,r,i)}function eR(e,t,a){if(e.measureText(t).width<=a)return t;let r=t;for(;r.length>0;){let t=`${r}...`;if(e.measureText(t).width<=a)return t;r=r.slice(0,-1)}return t}function eT(e,t,a,r){let i=t.split(/\s+/).filter(Boolean),n=[],l="";for(let t=0;t<i.length;t+=1){let o=i[t],s=l?`${l} ${o}`:o;if(e.measureText(s).width<=a){l=s;continue}if(n.length+1>=r){let r=`${l} ${o} ${i.slice(t+1).join(" ")}`.trim();return n.push(eR(e,r,a)),n}l&&n.push(l),l=o}return l&&n.push(l),n.slice(0,r)}function eU(e,t,a,r,i){let n=function(e){if("more"===e)return{fillStart:"#394150",fillEnd:"#1f2937",stroke:"rgba(255,255,255,0.35)",text:"#ffffff",glow:"rgba(17,24,39,0.34)"};let t=(0,f.Kq)(e);return{fillStart:t.gradientStart,fillEnd:t.gradientEnd,stroke:t.borderColor,text:t.textColor,glow:t.glowColor}}(i.tag);e.save(),e.font=i.font,e.textBaseline="middle",e.textAlign="left";let l=Math.max(4,Math.round(.23*i.height)),o=Math.max(4,Math.round(.18*i.height)),s=Math.max(12,(i.maxWidth??Number.POSITIVE_INFINITY)-2*i.paddingX-l-o),d=Number.isFinite(s)?eR(e,t,s):t,c=e.measureText(d).width,u=Math.max(i.height,c+2*i.paddingX+l+o);e.shadowColor=n.glow,e.shadowBlur=16;let p=e.createLinearGradient(a,r,a+u,r+i.height);p.addColorStop(0,n.fillStart),p.addColorStop(1,n.fillEnd),e.fillStyle=p,e.strokeStyle=n.stroke,e.lineWidth=i.lineWidth??1.5,eL(e,a,r,u,i.height,i.height/2),e.fill(),e.shadowColor="transparent",e.stroke();let g=a+i.paddingX+l/2,h=r+i.height/2;return e.fillStyle="rgba(255,255,255,0.96)",e.beginPath(),e.arc(g,h,l/2,0,2*Math.PI),e.fill(),e.fillStyle=n.text,e.fillText(d,a+i.paddingX+l+o,r+i.height/2+.5),e.restore(),u}function e$(e,t,a,r,i,n,l){let o=t.naturalWidth||t.width||i,s=t.naturalHeight||t.height||n,d=Math.max(i/o,n/s),c=o*d,u=s*d,p=(l?.x??0)/100*i,g=(l?.y??0)/100*n,h=l?.zoom??1,f=(l?.rotate??0)%360*Math.PI/180;e.save(),e.translate(a+i/2+p,r+n/2+g),f&&e.rotate(f),1!==h&&e.scale(h,h),e.drawImage(t,-c/2,-u/2,c,u),e.restore()}function eA(e,t="image/png",a=.92){return new Promise((r,i)=>{e.toBlob(e=>{e?r(e):i(Error("Failed to render card image."))},t,a)})}async function eM(e){let t=(e,t)=>{if(t<=1)return e;let a=`${Date.now()}-${t}`;try{let t=new URL(e,window.location.href);return t.searchParams.set("__ow_retry",a),t.toString()}catch{return`${e}${e.includes("?")?"&":"?"}__ow_retry=${a}`}};for(let a=1;a<=2;a+=1){let r="";try{let i=new AbortController,n=window.setTimeout(()=>i.abort(),8e3),l=await fetch(t(e,a),{signal:i.signal,cache:a>1?"no-store":"default"});if(window.clearTimeout(n),!l.ok)throw Error(`Image request failed (${l.status})`);let o=await l.blob();if("createImageBitmap"in window)return await createImageBitmap(o);let s=new Image;r=URL.createObjectURL(o);let d=new Promise((e,t)=>{s.onload=()=>e(s),s.onerror=()=>t(Error("Image failed to load"))});return s.src=r,await d}catch{if(a>=2)return null;await new Promise(e=>window.setTimeout(e,200*a))}finally{r&&URL.revokeObjectURL(r)}}return null}async function ez(e){for(let t of e){let e=String(t??"").trim();if(!e)continue;let a=await eM(e);if(a)return a}return null}function eI(e){if(x&&w===e)return x;let t=document.createElement("canvas");t.width=128,t.height=128;let a=t.getContext("2d");if(!a)return null;let r=a.createImageData(128,128);for(let e=0;e<r.data.length;e+=4){let t=Math.floor(255*Math.random());r.data[e]=t,r.data[e+1]=t,r.data[e+2]=t,r.data[e+3]=Math.floor(35*Math.random())}return a.putImageData(r,0,0),x=e.createPattern(t,"repeat"),w=e,x}function eO(e,t,a){let r=eE(t);e.clearRect(0,0,1080,1080);let i=e.createLinearGradient(0,0,0,1080);i.addColorStop(0,"#0f1016"),i.addColorStop(1,"#171826"),e.fillStyle=i,e.fillRect(0,0,1080,1080);let n=e.createRadialGradient(918,108,0,918,108,410.4);n.addColorStop(0,"rgba(255,176,90,0.25)"),n.addColorStop(1,"rgba(255,176,90,0)"),e.fillStyle=n,e.fillRect(0,0,1080,1080);let l=e.createRadialGradient(216,918,0,216,918,540);l.addColorStop(0,"rgba(255,210,140,0.14)"),l.addColorStop(1,"rgba(255,210,140,0)"),e.fillStyle=l,e.fillRect(0,0,1080,1080);let o=eI(e);o&&(e.save(),e.globalAlpha=.08,e.fillStyle=o,e.fillRect(0,0,1080,1080),e.restore()),e.save(),e.shadowColor="rgba(255,176,90,0.35)",e.shadowBlur=18,e.strokeStyle="rgba(255,176,90,0.55)",e.lineWidth=2,eL(e,14,14,1052,1052,56),e.stroke(),e.restore();let s=y(t).toUpperCase();e.save(),e.fillStyle="rgba(255,198,106,0.95)",e.font='900 34px "Arial Black", Impact, sans-serif',e.textBaseline="middle",eP(e,s,540,90,8),e.restore();let d=Math.round(885.5999999999999),u=Math.round(d/m),p=Math.round((1080-d)/2);e.save(),e.shadowColor="rgba(0,0,0,0.25)",e.shadowBlur=28,e.shadowOffsetY=16,e.fillStyle="#fffdf8",eL(e,p,150,d,u,34),e.fill(),e.shadowColor="transparent",e.strokeStyle="rgba(0,0,0,0.06)",e.lineWidth=2,eL(e,p+1,151,d-2,u-2,32),e.stroke(),e.restore();let g=p+0,h=d-0,b=u-0;a?(e.save(),e.beginPath(),eL(e,g,150,h,b,32),e.clip(),e$(e,a,g,150,h,b,r?.crop)):(e.save(),e.fillStyle="rgba(0,0,0,0.05)",eL(e,g,150,h,b,22),e.fill(),e.fillStyle="rgba(0,0,0,0.35)",e.font='600 28px "Segoe UI", Arial, sans-serif',e.textAlign="center",e.textBaseline="middle",e.fillText("No image",g+h/2,150+b/2)),e.restore();let x=et(t);if(x.length){let t=x.slice(0,3),a=176;for(let r of t)eU(e,(0,f.yU)(r).toUpperCase(),g+24,a,{tag:r,font:'800 24px "Segoe UI", Arial, sans-serif',height:46,paddingX:20,maxWidth:h-48,lineWidth:2}),a+=58;let r=x.length-t.length;r>0&&eU(e,`+${r} MORE`,g+24,a,{tag:"more",font:'800 24px "Segoe UI", Arial, sans-serif',height:46,paddingX:20,maxWidth:h-48,lineWidth:2})}let w=Y(t);e.save(),e.fillStyle="rgba(255,255,255,0.92)",e.font='600 30px "Segoe UI", Arial, sans-serif',e.textBaseline="top";let v=150+u+44;eT(e,w,940,2).forEach((t,a)=>{e.fillText(t,70,v+38*a)}),e.restore();let S=ev(t.condition);e.save(),e.font='700 20px "Segoe UI", Arial, sans-serif',e.textBaseline="middle",e.textAlign="left";let C=e.measureText(S).width;e.fillStyle="rgba(255,180,90,0.16)",e.strokeStyle="rgba(255,180,90,0.55)",e.lineWidth=2,eL(e,70,966,Math.max(C+36,120),44,22),e.fill(),e.stroke(),e.fillStyle="#6ef2d6",e.fillText(S,88,988),e.restore();let N=null===t.price||void 0===t.price?"-":(0,c.S)(Number(t.price));e.save(),e.font='800 60px "Arial Black", Impact, sans-serif',e.fillStyle="rgba(255,198,106,0.98)",e.textAlign="right",e.textBaseline="alphabetic",e.fillText(N,1010,1010),e.restore()}function eD(){let[e,t]=i.useState([]),[u,g]=i.useState(!1),[h,x]=i.useState(null),[w,v]=i.useState(""),[S,C]=i.useState("ALL"),[N,k]=i.useState(new Set),[j,_]=i.useState(!1),[E,L]=i.useState(!1),[T,U]=i.useState(!1),[W,Z]=i.useState(!1),[G,q]=i.useState(!1),[V,er]=i.useState(!1),[eo,es]=i.useState(0),[ef,ey]=i.useState(!1),[eD,eB]=i.useState([]),[eW,eH]=i.useState(null),[eZ,eG]=i.useState(null),[eF,eq]=i.useState(null),[eV,eJ]=i.useState(!1),[eX,eY]=i.useState(null),[eK,eQ]=i.useState(!1),[e0,e1]=i.useState("download_category"),[e2,e5]=i.useState(!1),[e4,e9]=i.useState(0),e8=i.useRef(null),e6=i.useMemo(()=>eS(w),[w]),e3=i.useMemo(()=>e6?e6.split(/\s+/).filter(Boolean):[],[e6]),e7=i.useMemo(()=>{let t=new Set;for(let a of e)for(let e of z(a))e&&t.add(e);for(let e of P)e&&t.add(e);return[...P.filter(e=>t.has(e)),...Array.from(t).filter(e=>!P.includes(e)).sort((e,t)=>e.localeCompare(t))]},[e,e4]),te=i.useMemo(()=>{let e=[...e7];return"ALL"!==S&&S&&!e.includes(S)&&e.push(S),e},[e7,S]),tt=i.useMemo(()=>{let t=e;return e3.length&&(t=t.filter(e=>(function(e,t){if(!t.length)return!0;let a=eS([Y(e),y(e),eh(e),ep(e),eg(e),e.product?.title??"",e.product?.brand??"",e.product?.model??"",e.product?.variation??"",ew(e.condition),ev(e.condition),...z(e),function(e){let t=String(e.ship_class??"").trim();return t?`${t} ${t.replace(/_/g," ")}`.trim():""}(e),...$(e)?["jdm","jp","japan"]:["eur","eu","europe","us","usa","eur/us","eurus"]].join(" "));return t.every(e=>a.includes(e))})(e,e3))),"ALL"!==S&&(t=t.filter(e=>I(e,S))),t},[e,e3,S,e4]),ta=i.useMemo(()=>N.size?e.filter(e=>N.has(e.id)):[],[e,N]),tr=i.useMemo(()=>tt.length>0&&tt.every(e=>N.has(e.id)),[tt,N]),ti=i.useMemo(()=>tt.some(e=>N.has(e.id)),[tt,N]),tn=i.useRef(null),tl=i.useMemo(()=>tt.reduce((e,t)=>e+Number(t.qty??0),0),[tt]),to=i.useMemo(()=>tp(tt),[tt,e4]),ts=i.useCallback((e,t)=>{k(a=>{let r=new Set(a);return t?r.add(e):r.delete(e),r})},[]),td=i.useCallback(e=>{k(t=>{let a=new Set(t);for(let t of tt)e?a.add(t.id):a.delete(t.id);return a})},[tt]),tc=i.useCallback(()=>{k(new Set)},[]);async function tu(){if(!u){g(!0),x(null);try{let e=[],a=0;for(;;){let t=200*a,r=t+200-1,{data:i,error:l}=await n.OQ.from("product_variants").select("id,created_at,condition,ship_class,qty,price, product:products(id,title,brand,model,variation,special_tags,image_urls,created_at)").order("created_at",{ascending:!1}).range(t,r);if(l)throw Error(l.message||"Failed to load inventory sheet.");let o=el(i??[]);if(e.push(...o),o.length<200)break;a+=1}t(e)}catch(e){x(e?.message??"Failed to load inventory sheet.")}finally{g(!1)}}}function tp(e){let t=new Map;for(let a of e){let e=ep(a),r=t.get(e)??[];r.push(a),t.set(e,r)}return Array.from(t.entries()).sort((e,t)=>e[0].localeCompare(t[0])).map(([e,t])=>({brand:e,rows:t.sort((e,t)=>{let a=ex(eg(e)),r=ex(eg(t)),i=a.localeCompare(r);return 0!==i?i:Y(e).localeCompare(Y(t))})}))}async function tg(){let e=[],t=0;for(;;){let a=1e3*t,r=a+1e3-1,{data:i,error:l}=await n.OQ.from("product_variants").select("id,created_at,condition,ship_class,qty,price, product:products(id,title,brand,model,variation,special_tags,image_urls,created_at)").gt("qty",0).order("created_at",{ascending:!1}).range(a,r);if(l)throw Error(l.message||"Failed to export inventory.");let o=el(i??[]);if(e=[...e,...o],o.length<1e3)break;t+=1}return e}async function th(){let e=[],t=0;for(;;){let a=1e3*t,r=a+1e3-1,{data:i,error:l}=await n.OQ.from("products").select("id,title,brand,model,variation").order("created_at",{ascending:!1}).range(a,r);if(l)throw Error(l.message||"Failed to load products.");let o=i??[];if(e=[...e,...o],o.length<1e3)break;t+=1}return e}async function tf(){return ta.length?{rows:ta.filter(B),scope:"selected"}:{rows:D((await tg()).filter(B),S),scope:"category"}}let tm=eo>0;function tb(e){e8.current=e,es(e?.pendingPages.length??0)}function tx(e){let t=new Set,a=[];for(let r of e)t.has(r.id)||(t.add(r.id),a.push(r));return a}function tw(e){for(let t of e)if(t&&"close"in t)try{t.close()}catch{}}async function ty(e){let t=document.createElement("canvas");t.width=1080,t.height=1080;let a=t.getContext("2d");if(!a)throw Error("Canvas not available.");let r=[],i=[],n=0,l=0;for(let o=0;o<e.pages.length;o+=1){let s=e.pages[o],d=await Promise.all(s.rows.map(async e=>{let t=ej(e);return{row:e,image:await ez(t),imageCandidates:t}})),c=d.filter(e=>!e.image).map(e=>e.row);if(c.length&&e.deferFailedPages)r.push(s),i.push(...c),tw(d.map(e=>e.image));else{let r=d.map(e=>e.image);for(l+=c.length;r.length<4;)r.push(null);!function(e,t,a,r){e.clearRect(0,0,1080,1080),e.imageSmoothingEnabled=!0,e.imageSmoothingQuality="high";let i=e.createLinearGradient(0,0,0,1080);i.addColorStop(0,"#0f1016"),i.addColorStop(1,"#171826"),e.fillStyle=i,e.fillRect(0,0,1080,1080);let n=eI(e);n&&(e.save(),e.globalAlpha=.06,e.fillStyle=n,e.fillRect(0,0,1080,1080),e.restore()),e.save(),e.strokeStyle="rgba(255,138,0,0.55)",e.lineWidth=2,eL(e,1,1,1078,1078,24),e.stroke(),e.restore();let l=O(r);l&&(e.save(),e.fillStyle="#ff8a00",e.font='800 22px "Arial Black", Impact, sans-serif',e.textAlign="center",e.textBaseline="middle",e.shadowColor="rgba(255,138,0,0.35)",e.shadowBlur=8,e.fillText(l.toUpperCase(),540,32),e.restore()),e.save(),e.font='700 12px "Segoe UI", Arial, sans-serif',e.textBaseline="middle";let o="EXPLORE THE FULL ",s=" COLLECTION AT ODD-WHEELS.COM",d=r?r.toUpperCase():"COLLECTION",c=e.measureText(o).width,u=e.measureText(d).width,p=540-(c+u+e.measureText(s).width)/2;e.fillStyle="rgba(255,255,255,0.75)",e.fillText(o,p,1054),p+=c,e.fillStyle="#ff8a00",e.fillText(d,p,1054),p+=u,e.fillStyle="rgba(255,255,255,0.75)",e.fillText(s,p,1054),e.restore();for(let r=0;r<4;r+=1){let i=14+r%2*532,n=50+502*Math.floor(r/2),l=t[r],o=a[r]??null,s=l?eE(l):null;e.save(),e.shadowColor="rgba(0,0,0,0.45)",e.shadowBlur=16,e.shadowOffsetY=8;let d=e.createLinearGradient(i,n,i,n+490);if(d.addColorStop(0,"#1b1c23"),d.addColorStop(1,"#14151b"),e.fillStyle=d,eL(e,i,n,520,490,16),e.fill(),e.restore(),e.save(),e.strokeStyle="rgba(255,255,255,0.12)",e.lineWidth=1,eL(e,i,n,520,490,16),e.stroke(),e.restore(),!l)continue;let c=i+10,u=n+10,p=y(l).toUpperCase();e.save(),e.fillStyle="rgba(255,210,140,0.9)",e.font='700 10px "Segoe UI", Arial, sans-serif',e.textBaseline="top",eP(e,eR(e,p,500),c+250,u,2),e.restore(),u+=16;let g=n+490-10-24,h=eT(e,Y(l),500,2),b=14*h.length,x=l.variant_count>1?12:0,w=l.variant_count>1?2:0,v=Math.max(110,Math.min(Math.round(500/m),g-6-u-b-x-w-6)),S=u;e.save(),e.fillStyle="#ffffff",eL(e,c,S,500,v,10),e.fill(),e.restore(),o?(e.save(),e.beginPath(),eL(e,c,S,500,v,10),e.clip(),e$(e,o,c,S,500,v,s?.crop)):(e.save(),e.fillStyle="rgba(0,0,0,0.35)",e.font='600 11px "Segoe UI", Arial, sans-serif',e.textAlign="center",e.textBaseline="middle",e.fillText("No image",c+250,S+v/2)),e.restore();let C=et(l);if(C.length){let t=C.slice(0,2),a=S+8;for(let r of t)eU(e,(0,f.yU)(r).toUpperCase(),c+8,a,{tag:r,font:'800 9px "Segoe UI", Arial, sans-serif',height:18,paddingX:7,maxWidth:484,lineWidth:1}),a+=21;let r=C.length-t.length;r>0&&eU(e,`+${r} more`,c+8,a,{tag:"more",font:'800 9px "Segoe UI", Arial, sans-serif',height:18,paddingX:7,maxWidth:484,lineWidth:1})}u=S+v+6,e.save(),e.fillStyle="rgba(255,255,255,0.92)",e.font='600 12px "Segoe UI", Arial, sans-serif',e.textAlign="left",e.textBaseline="top",h.forEach((t,a)=>{e.fillText(t,c,u+14*a)}),e.restore(),u+=b+w,l.variant_count>1&&(e.save(),e.fillStyle="rgba(255,255,255,0.7)",e.font='600 10px "Segoe UI", Arial, sans-serif',e.textBaseline="top",e.fillText("Multiple variants available",c,u),e.restore());let N=ee(l);e.save(),e.font='800 11px "Segoe UI", Arial, sans-serif',e.textBaseline="middle",e.textAlign="left";let k=Math.max(e.measureText(N).width+20,66);eL(e,c,g,k,24,12),e.fillStyle="rgba(255,180,90,0.18)",e.fill(),e.strokeStyle="rgba(255,205,140,0.72)",e.lineWidth=1.5,e.stroke(),e.fillStyle="#fff4de",e.fillText(N,c+10,g+12),e.restore();let j=Q(l);e.save(),e.font='900 18px "Arial Black", Impact, sans-serif';let _=c+500-e.measureText(j).width-6-22,E=g+12;e.fillStyle="rgba(255,184,92,0.14)",e.strokeStyle="rgba(255,205,140,0.62)",e.lineWidth=1.5,e.beginPath(),e.arc(_+11,E,11,0,2*Math.PI),e.fill(),e.stroke(),e.fillStyle="#ffb85c",e.font='700 11px "Segoe UI", Arial, sans-serif',e.textAlign="center",e.textBaseline="middle",e.fillText("\uD83D\uDED2",_+11,E+.5),e.font='900 18px "Arial Black", Impact, sans-serif',e.textAlign="left",e.fillText(j,_+22+6,E+.5),e.restore()}}(a,s.rows,r,s.group);let i=await eA(t,"image/png");(s.folderName?e.zip.folder(s.folderName)??e.zip:e.zip).file(s.fileName,i),tw(r),n+=1}let u=o+1;if(u%3==0||u===e.pages.length){let t=e.renderedSoFar+n,a=r.length;eY(`Rendering ${t} of ${e.totalPages} pages${a?` | deferred ${a}`:""}...`),await new Promise(e=>setTimeout(e,0))}}return{deferredPages:r,failedRows:i,renderedPages:n,unresolvedRenderedCount:l}}async function tv(e){let t=await e.zip.generateAsync({type:"blob"}),a=URL.createObjectURL(t),r=document.createElement("a");r.href=a,r.download=e.downloadName,document.body.appendChild(r),r.click(),r.remove(),URL.revokeObjectURL(a);let i=[`4-up ZIP downloaded (${e.totalPages} pages).`];e.singleFolder&&i.push("All pages were saved in one folder (flat ZIP)."),e.skippedNoImage>0&&i.push(`Skipped ${e.skippedNoImage} item(s) without thumbnail.`),e.unresolvedRenderedCount>0&&i.push(`${e.unresolvedRenderedCount} image(s) still failed after retries and were rendered as "No image".`),eY(i.join(" ")),eB([]),ey(!1),eH(null),tb(null)}async function tS(e=!1){if(V)return;let t=e8.current;if(t){ey(!1),er(!0),x(null),eY(e?"Finishing ZIP with unresolved items included...":"Refreshing deferred items and retrying...");try{let a=t.pendingPages;if(!e){let e=await tg(),r=new Map(e.map(e=>[e.id,e]));a=t.pendingPages.map(e=>({folderName:e.folderName,fileName:e.fileName,group:e.group,rows:e.rows.map(e=>{var t;return(t=r.get(e.id))?{...e,...t,product:t.product}:e})}))}let r=await ty({pages:a,zip:t.zip,totalPages:t.totalPages,renderedSoFar:t.renderedPages,deferFailedPages:!e}),i={...t,renderedPages:t.renderedPages+r.renderedPages,pendingPages:r.deferredPages,unresolvedRenderedCount:t.unresolvedRenderedCount+r.unresolvedRenderedCount};if(i.pendingPages.length>0){tb(i);let e=tx(r.failedRows);eB(e),ey(!0),eY(`ZIP paused: ${i.pendingPages.length} page(s) still need first-photo download. Edit those product photos and click Retry & Resume ZIP.`);return}await tv(i)}catch(e){x(e?.message??"Export failed.")}finally{er(!1)}}}async function tC(e){let t=String(e??"").trim();if(t&&!eF){eq(t),x(null);try{let{data:e,error:a}=await n.OQ.from("products").select("id,title,brand,model,variation,special_tags,image_urls,is_active,created_at,product_variants(id,condition,barcode,cost,price,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,issue_notes,issue_photo_urls,public_notes,created_at)").eq("id",t).maybeSingle();if(a)throw Error(a.message||"Failed to open product editor.");if(!e)throw Error("Product not found.");ey(!1),eG(e)}catch(e){x(e?.message??"Failed to open product editor.")}finally{eq(null)}}}async function tN(){if(!j){_(!0),eY(null);try{let{rows:e,scope:t}=await tf();if(!e.length){eY("selected"===t?"No selected rows available.":"No rows for the selected category.");return}let a=["Name,Make,Model,Product Tags,Condition,Qty,Price,Photo URL"];for(let t of e){let e=t.product?.image_urls?.[0]??"",r=eu(t),i=[Y(t),r.make,r.model,ea(t),ew(t.condition),Number(t.qty??0),Number(t.price??0),e];a.push(i.map(eC).join(","))}let r=new Blob([a.join("\n")],{type:"text/csv;charset=utf-8;"}),i=URL.createObjectURL(r),n=document.createElement("a");n.href=i,n.download="inventory-sheet.csv",document.body.appendChild(n),n.click(),n.remove(),URL.revokeObjectURL(i)}catch(e){x(e?.message??"Export failed.")}finally{_(!1)}}}function tk(e,t=80){return e.replace(/[^a-z0-9\-_ ]/gi,"").trim().replace(/\s+/g,"_").slice(0,t)}function tj(e){let t=String(e.ship_class??"UNASSIGNED").trim();return tk(t?t.replace(/_/g," ").toLowerCase().replace(/\b\w/g,e=>e.toUpperCase()):"UNASSIGNED")||"UNASSIGNED"}function t_(e){let t=eh(e);if(t&&!/^unknown$/i.test(t))return t;let a=Y(e);return a&&!/^untitled$/i.test(a)?a:"item"}async function tE(){if(!E){L(!0),eY(null),x(null);try{let{rows:e,scope:t}=await tf();if(!e.length){eY("selected"===t?"No selected rows available.":"No rows for the selected category.");return}let r=new(await a.e(9722).then(a.t.bind(a,49722,23))).default,i=["Name,Make,Model,Product Tags,Condition,Qty,Price,Photo File,Photo URL"],n=0,l=0;for(let t of e){let e=t.product?.image_urls?.[0]??"",a="";if(e)try{let i=await fetch(e);if(i.ok){let l=await i.blob(),o=tk(t_(t),140)||"item",s=function(e){try{let t=new URL(e).pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i);if(t?.[1])return`.${t[1].toLowerCase()}`}catch{}return".jpg"}(e),d=tj(t),c=tk(y(t))||"Unknown";a=`${d}/${c}/${o}_${t.id.slice(0,8)}${s}`,r.file(a,l),n+=1}else l+=1}catch{l+=1}let o=eu(t),s=[Y(t),o.make,o.model,ea(t),ew(t.condition),Number(t.qty??0),Number(t.price??0),a,e];i.push(s.map(eC).join(","))}r.file("inventory-sheet.csv",i.join("\n"));let o=await r.generateAsync({type:"blob"}),s=URL.createObjectURL(o),d=document.createElement("a");d.href=s,d.download="inventory-sheet.zip",document.body.appendChild(d),d.click(),d.remove(),URL.revokeObjectURL(s);let c=[`${n} photos added`];l&&c.push(`${l} skipped`),eY(c.join(" | "))}catch(e){x(e?.message??"Export failed.")}finally{L(!1)}}}async function tL(){if(!e2&&confirm("This will update product titles and model fields using inferred make/model data. Continue?")){e5(!0),eY(null),x(null);try{let e=await th(),t=[];for(let a of e){let e=eu({id:a.id??"",created_at:null,condition:null,ship_class:null,qty:null,price:null,product:{id:a.id??"",title:a.title??"",brand:a.brand??null,model:a.model??null,variation:a.variation??null,special_tags:null,image_urls:null,created_at:null}}),r=e.make&&"Unknown"!==e.make?e.make:"",i=e.model&&"Unknown"!==e.model?e.model:"",n=String(a.model??"").trim(),l=function(e,t,a=[]){let r=X(e,a);if(!(r=(r=(r=(r=(r=(r=(r=function(e,t){let a=String(e??""),r=String(t??"").trim();if(!a||!r||"Unknown"===r)return a;let i=RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\\s+/g,"\\s+").replace(/-/g,"[-\\s]?")}\\b`,"ig");return a.replace(i," ").replace(/\s{2,}/g," ").trim()}(r,t)).replace(/\b1\s*[:/]\s*\d+\b/gi," ")).replace(/\bscale\b/gi," ")).replace(/\bmodel\b/gi," ")).replace(/\bdiecast\b/gi," ")).replace(/[,|]/g," ")).replace(/\s{2,}/g," ").trim()))return"";let i=ed(r,t);return"Unknown"===i?"":i}(n,r,[a.brand??""]),o=i?!function(e,t){let a=e.trim();if(!a||a.length<=2)return!0;let r=a.toUpperCase();return!!F.has(r)||!em(a,t)&&!em(t,a)&&t.length>a.length}(l,i)?l:i:l,s=r?function(e,t){let a=String(e??"").trim(),r=String(t??"").trim();if(!a)return r;if(!r)return a;let i=eb(a),n=eb(r);return i&&n&&(n.startsWith(i)||em(n,i)||em(i,n))?r:`${a} ${r}`.trim()}(r,o):o,d=String(a.title??"").trim(),c=r&&i?function(e,t,a){let r=String(e??"").trim();if(!r)return`${t} ${a}`.trim();let i=em(r,t),n=em(r,a);if(i&&n)return r;let l="";return(i||n?i?n||(l=a):l=t:l=`${t} ${a}`,l)?`${r} ${l}`.replace(/\s{2,}/g," ").trim():r}(d,r,i):d,u=ec(c||d).trim()||d.trim(),p=!!s&&eb(s)!==eb(n),g=u!==d;(p||g)&&t.push({id:a.id,title:u,...p?{model:s}:{}})}if(!t.length){eY("No updates needed.");return}let a=0;for(let e=0;e<t.length;e+=100){let r=t.slice(e,e+100),{error:i}=await n.OQ.from("products").upsert(r,{onConflict:"id"});if(i)throw i;(a+=r.length)%200==0&&(eY(`Updated ${a} of ${t.length} products...`),await new Promise(e=>setTimeout(e,0)))}eY(`Updated ${a} products.`),J.clear(),await tu()}catch(e){x(e?.message??"Update failed.")}finally{e5(!1)}}}async function tP(){if(!W){Z(!0),eY(null),x(null);try{let{rows:e,scope:t}=await tf();if(!e.length){eY("selected"===t?"No selected rows available.":"No rows for the selected category.");return}let r=tp(e).flatMap(e=>e.rows),i=function(e){let t=[],a=new Map;for(let r of e){let e=String(r.condition??"").toLowerCase().trim();if("sealed"!==e&&"unsealed"!==e){t.push(r);continue}let i=r.product?.id??r.id,n=`${i}::sealed_unsealed`,l=a.get(n);if(!l){t.push(r),a.set(n,{index:t.length-1,hasSealed:"sealed"===e,hasUnsealed:"unsealed"===e,preferred:"sealed"===e?"sealed":"unsealed"});continue}"sealed"===e&&(l.hasSealed=!0),"unsealed"===e&&(l.hasUnsealed=!0),"sealed"===e&&"sealed"!==l.preferred&&(t[l.index]=r,l.preferred="sealed"),l.hasSealed&&l.hasUnsealed&&(t[l.index]={...t[l.index],condition:"sealed_unsealed"})}return t}(r),n=new(await a.e(9722).then(a.t.bind(a,49722,23))).default,l=document.createElement("canvas");l.width=1080,l.height=1080;let o=l.getContext("2d");if(!o)throw Error("Canvas not available.");let s=0,d=0,c=0,u=i.length,p=new Map;for(let e of(eY(`Rendering 0 of ${u} cards...`),i)){let t=function(e,t){let a=tk(y(e))||"Unknown",r=tj(e),i=(A(e)?b:M(e))||"Others";return"none"===t?[]:"brand"===t?[a]:"ship_class"===t?[r]:"ship_class_brand"===t?[r,a]:"brand_ship_class"===t?[a,r]:"download_category"===t?[tk(i,60)||"Others"]:[]}(e,e0),a=n;if(t.length){let e=t.join("/"),r=p.get(e)??0,i=Math.floor(r/80)+1;p.set(e,r+1);let l=[...t];if(i>1){let e=l.length-1;l[e]=`${l[e]} (${i})`}a=function(e,t){let a=e;for(let e of t)a=a.folder(e)??a;return a}(n,l)}let r=e.product?.image_urls?.[0]??"",i=r?await eM(r):null;r&&i||(d+=1),eO(o,e,i);let g=await eA(l,"image/png"),h=tk(t_(e),140)||"item",f=tk(ev(e.condition)),m=`${h}_${f}_${e.id.slice(0,8)}.png`;if(a.file(m,g),i&&"close"in i)try{i.close()}catch{}s+=1,(c+=1)%15==0&&(eY(`Rendering ${c} of ${u} cards...`),await new Promise(e=>setTimeout(e,0)))}let g=await n.generateAsync({type:"blob"}),h=URL.createObjectURL(g),f=document.createElement("a");f.href=h,f.download="inventory-cards.zip",document.body.appendChild(f),f.click(),f.remove(),URL.revokeObjectURL(h);let m={download_category:"4-up category",brand:"brand",ship_class:"class",ship_class_brand:"class to brand",brand_ship_class:"brand to class",none:"no folders"}[e0]??e0.replace(/_/g," "),x=[`${s} cards`,`grouped by ${m}`];d&&x.push(`${d} missing images`),eY(x.join(" | "))}catch(e){x(e?.message??"Export failed.")}finally{Z(!1)}}}async function tR(e){return await new Promise((t,a)=>{let r=new FileReader;r.onerror=()=>a(Error("Failed to read image.")),r.onload=()=>t(String(r.result??"")),r.readAsDataURL(e)})}async function tT(){if(!eV){eJ(!0),eY(null),x(null);try{let t=ta[0]??D(e,S)[0]??D(await tg(),S)[0];if(!t)throw Error("No products available to preview.");let a=t.product?.image_urls?.[0]??"",r=a?await eM(a):null,i=document.createElement("canvas");i.width=1080,i.height=1080;let n=i.getContext("2d");if(!n)throw Error("Canvas not available.");eO(n,t,r);let l=await eA(i,"image/png"),o=await tR(l);if(r&&"close"in r)try{r.close()}catch{}let s=eN(Y(t)),d=eN(y(t).toUpperCase()),c=`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Card Preview</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top right, rgba(255,176,90,0.18), transparent 55%),
          radial-gradient(circle at bottom left, rgba(255,210,140,0.12), transparent 55%),
          #0f1016;
        color: #fff;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .frame {
        width: min(92vw, 520px);
        display: grid;
        gap: 12px;
        text-align: center;
      }
      .meta {
        font-size: 12px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(255,198,106,0.9);
      }
      img {
        width: 100%;
        height: auto;
        border-radius: 24px;
        box-shadow: 0 22px 50px rgba(0,0,0,0.45);
      }
      .title {
        font-size: 14px;
        color: rgba(255,255,255,0.8);
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="meta">${d}</div>
      <img src="${o}" alt="${s}" />
      <div class="title">${s}</div>
    </div>
  </body>
</html>`,u=URL.createObjectURL(new Blob([c],{type:"text/html;charset=utf-8;"}));if(!window.open(u,"_blank"))throw Error("Preview blocked. Allow popups to preview.");setTimeout(()=>URL.revokeObjectURL(u),6e4),eY("Card preview opened.")}catch(e){x(e?.message??"Preview failed.")}finally{eJ(!1)}}}async function tU(e,t=5){let a=Array.from(new Set(e.map(e=>e.product?.image_urls?.[0]).filter(e=>!!e).map(e=>ek(e,{width:140,height:140,quality:60})))),r=new Map,i=0,n=Array.from({length:Math.min(t,a.length)}).map(async()=>{for(;i<a.length;){let e=a[i];if(i+=1,e)try{let t=await fetch(e);if(!t.ok)continue;let a=await t.blob(),i=await tR(a);r.set(e,i)}catch{}}});return await Promise.all(n),r}async function t$(){if(!T){U(!0),eY(null),x(null);try{let{rows:e,scope:t}=await tf();if(!e.length){eY("selected"===t?"No selected rows available.":"No rows for the selected category.");return}let a=tp(e),r=await tU(e),i=a.map(e=>{let t=`<tr class="group"><td colspan="7">${e.brand} (${e.rows.length})</td></tr>`,a=e.rows.map(e=>{let t=e.product?.image_urls?.[0]??"",a=r.get(t)??"",i=a?`<img src="${a}" alt=""/>`:'<span class="no-image">No image</span>',n=ei(e,{containerClassName:"product-tags product-tags--table"})||'<span class="muted">-</span>';return`
                <tr>
                  <td class="photo">${i}</td>
                  <td>${eC(Y(e))}</td>
                  <td class="muted">${eC(eh(e))}</td>
                  <td>${n}</td>
                  <td class="muted">${eC(ew(e.condition))}</td>
                  <td class="num">${Number(e.qty??0)}</td>
                  <td class="num">${(0,c.S)(Number(e.price??0))}</td>
                </tr>
              `}).join("");return`${t}${a}`}).join(""),n=`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventory Sheet</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0b0c;
        --panel: #121317;
        --line: rgba(255,255,255,0.08);
        --text: #f8fafc;
        --muted: rgba(255,255,255,0.7);
        --accent: rgba(255, 140, 66, 0.8);
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .wrap {
        max-width: 1200px;
        margin: 32px auto;
        padding: 0 20px 32px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 16px;
      }
      .title {
        font-size: 24px;
        font-weight: 700;
      }
      .subtitle {
        font-size: 13px;
        color: var(--muted);
      }
      .meta {
        display: flex;
        gap: 10px;
        font-size: 12px;
        color: var(--muted);
      }
      .meta span {
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #1a1b20;
      }
      .table-wrap {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        overflow: hidden;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      thead {
        background: #15161b;
      }
      th, td {
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
      }
      th {
        font-size: 12px;
        color: var(--muted);
        font-weight: 600;
      }
      .group td {
        background: #101116;
        font-weight: 600;
        color: var(--text);
        border-bottom: 1px solid var(--line);
      }
      .photo {
        width: 56px;
      }
      .photo img {
        height: 44px;
        width: 44px;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: #f8fafc;
      }
      .no-image {
        display: inline-flex;
        width: 44px;
        height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        border: 1px solid var(--line);
        font-size: 10px;
        color: var(--muted);
      }
      .muted {
        color: var(--muted);
      }
      .product-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }
      .product-tags--table {
        gap: 6px;
      }
      .product-tag {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        max-width: 100%;
        min-height: 26px;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1.5px solid rgba(255,255,255,0.22);
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .product-tag__dot {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.38);
      }
      .product-tag__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      ${en()}
      .num {
        text-align: right;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div>
          <div class="title">Inventory Sheet</div>
          <div class="subtitle">Snapshot export with photos</div>
        </div>
        <div class="meta">
          <span>${e.length} rows</span>
          <span>${e.reduce((e,t)=>e+Number(t.qty??0),0)} qty</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Model</th>
              <th>Product Tags</th>
              <th>Condition</th>
              <th style="text-align:right;">Qty</th>
              <th style="text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${i}
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`,l=new Blob([n],{type:"text/html;charset=utf-8;"}),o=URL.createObjectURL(l),s=document.createElement("a");s.href=o,s.download="inventory-sheet.html",document.body.appendChild(s),s.click(),s.remove(),URL.revokeObjectURL(o),eY("HTML sheet downloaded with embedded photos.")}catch(e){x(e?.message??"Export failed.")}finally{U(!1)}}}function tA(e){let t=e=>"Truescales"===e||e.startsWith("Truescales "),a=[...e.flatMap(e=>S&&"ALL"!==S?I(e,S)?[{group:S,row:e}]:[]:z(e).map(t=>({group:t,row:e})))].sort((e,a)=>{let r=e.group||"Others",i=a.group||"Others",n=P.indexOf(r),l=P.indexOf(i);if(n!==l)return(-1===n?999:n)-(-1===l?999:l);if(t(r)&&t(i)){let t=ex(eh(e.row)),r=ex(eh(a.row)),i=t.localeCompare(r);if(0!==i)return i;let n=Y(e.row).toLowerCase(),l=Y(a.row).toLowerCase();return n.localeCompare(l)}let o=R(y(e.row)),s=R(y(a.row)),d=o.localeCompare(s);if(0!==d)return d;let c=ex(eh(e.row)),u=ex(eh(a.row)),p=c.localeCompare(u);if(0!==p)return p;let g=Y(e.row).toLowerCase(),h=Y(a.row).toLowerCase();return g.localeCompare(h)}),r=[],i="",n=[],l=()=>{if(n.length){for(let e=0;e<n.length;e+=4)r.push({group:i||"Unassigned",rows:n.slice(e,e+4)});n=[]}};for(let e of a){let t=e.group||"Others";i||(i=t),t!==i&&(l(),i=t),n.push(e.row)}return l(),r}async function tM(){if(!G){q(!0),eY(null),x(null);try{let{rows:e,scope:t}=await tf();if(!e.length){eY("selected"===t?"No selected rows available.":"No rows for the selected category.");return}let a=K(e),r=a.filter(e_),i=a.length-r.length;if(!r.length){eY("No rows with thumbnail/first photo for 4-up export. Add a first photo to each item.");return}let n=tA(r),l=n.map((e,t)=>{let a=Array.from({length:4}).map((t,a)=>{let r=e.rows[a];if(!r)return'<div class="card empty"></div>';let i=eE(r),n=ej(r),l=i?.src?eN(i.src):"",o=function(e){let t=(0,p.hw)(e);return t?.transform?` style="${eN(`transform: ${t.transform}; transform-origin: ${t.transformOrigin??"center"};`)}"`:""}(i?.crop),s=eN(JSON.stringify(n.slice(1))),d=l?` data-fallback-index="0" data-fallback-sources="${s}" onerror="window.__owFallbackImage && window.__owFallbackImage(this)"`:"",c=l?`<img src="${l}" alt="" loading="lazy" decoding="async" width="960" height="720" data-load-retries="0" data-load-max-retries="3"${o}${d}/>`:'<div class="img-placeholder">No image</div>',u=eN(y(r).toUpperCase()),g=eN(Y(r)),h=eN(ee(r)),f=eN(Q(r)),m=ei(r,{containerClassName:"product-tags product-tags--card",maxVisible:2}),b=r.variant_count>1?'<div class="card-variants">Multiple variants available</div>':"";return`
              <div class="card">
                <div class="card-brand">${u}</div>
                <div class="card-image">
                  ${m}
                  ${c}
                </div>
                <div class="card-title">${g}</div>
                ${b}
                <div class="card-meta">
                  <span class="card-condition">${h}</span>
                  <span class="card-price">
                    <span class="card-cart">🛒</span>
                    ${f}
                  </span>
                </div>
              </div>
            `}),r=eN(e.group.toUpperCase());return`
            <section class="page" data-page="${t+1}">
              <div class="page-frame">
                <div class="page-header">
                  <div class="page-title">${eN(O(e.group))}</div>
                </div>
                <div class="page-grid">
                  ${a.join("")}
                </div>
                <div class="page-footer">
                  EXPLORE THE FULL
                  <span class="page-footer__accent">${r}</span>
                  COLLECTION AT ODD-WHEELS.COM
                </div>
              </div>
            </section>
          `}).join(""),o=`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventory 4-up Pages</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0b0f;
        --panel: #15161c;
        --panel-2: #0f1117;
        --stroke: rgba(255,255,255,0.1);
        --accent: #ff8a00;
        --accent-soft: rgba(255,138,0,0.25);
        --text: #f8fafc;
        --muted: rgba(255,255,255,0.7);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: var(--text);
        -webkit-print-color-adjust: exact;
      }
      @page {
        size: 1080px 1080px;
        margin: 0;
      }
      .page {
        width: 1080px;
        height: 1080px;
        margin: 0 auto 32px;
        padding: 0;
        position: relative;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
        page-break-after: always;
      }
      .page-frame {
        width: 100%;
        height: 100%;
        margin: 0;
        border: 1px solid rgba(255,138,0,0.55);
        border-radius: 24px;
        padding: 14px;
        background: linear-gradient(180deg, rgba(20,20,26,0.92), rgba(12,12,16,0.96));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 36px;
      }
      .page-title {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
        text-shadow: 0 6px 18px rgba(255,138,0,0.35);
      }
      .page-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
        gap: 12px;
        flex: 1;
      }
      .page-footer {
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        text-align: center;
        color: rgba(255,255,255,0.72);
        margin-bottom: 2px;
      }
      .page-footer__accent {
        color: var(--accent);
        font-weight: 700;
        margin: 0 6px;
      }
      .card {
        background: linear-gradient(180deg, #1b1c23 0%, #14151b 100%);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px;
        padding: 10px 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: 0 10px 22px rgba(0,0,0,0.45);
      }
      .card.empty {
        background: transparent;
        border: 1px dashed rgba(255,255,255,0.08);
        box-shadow: none;
      }
      .card-brand {
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        text-align: center;
        color: rgba(255,210,140,0.9);
        font-weight: 700;
      }
      .card-image {
        background: #fffdf8;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.30);
        width: 100%;
        aspect-ratio: 4 / 3;
        flex: none;
        position: relative;
        overflow: hidden;
        box-shadow: 0 12px 25px rgba(0,0,0,0.18);
      }
      .card-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        display: block;
        image-rendering: auto;
        transform: translateZ(0);
      }
      .img-placeholder {
        color: rgba(0,0,0,0.5);
        font-size: 11px;
        text-align: center;
      }
      .product-tags {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .product-tags--card {
        position: absolute;
        top: 10px;
        left: 10px;
        right: 10px;
        z-index: 2;
        pointer-events: none;
      }
      .product-tag {
        width: fit-content;
        max-width: 100%;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 24px;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1.5px solid rgba(255,255,255,0.22);
        box-shadow: 0 10px 20px rgba(0,0,0,0.26);
        font-size: 9px;
        line-height: 1;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .product-tag__dot {
        width: 6px;
        height: 6px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.38);
      }
      .product-tag__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      ${en()}
      .card-title {
        font-size: 12px;
        line-height: 1.25;
        color: var(--text);
        min-height: 28px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .card-variants {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        letter-spacing: 0.03em;
      }
      .card-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: auto;
      }
      .card-condition {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1.5px solid rgba(255,205,140,0.62);
        background: rgba(255,180,90,0.18);
        color: #fff4de;
        font-weight: 800;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
      }
      .card-price {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0.01em;
        color: #ffb85c;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-shadow: 0 1px 0 rgba(0,0,0,0.35);
      }
      .card-cart {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(255,184,92,0.14);
        border: 1.5px solid rgba(255,205,140,0.52);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    ${l}
    <script>
      (function () {
        function normalizeSource(src) {
          var raw = String(src || "").trim();
          if (!raw) return "";
          try {
            var url = new URL(raw, window.location.href);
            url.searchParams.delete("__ow_retry");
            return url.toString();
          } catch (_err) {
            return raw.replace(/([?&])__ow_retry=[^&#]*&?/g, "$1").replace(/[?&]$/, "");
          }
        }

        function withRetrySource(src, attempt) {
          var raw = String(src || "").trim();
          if (!raw) return "";
          var value = String(Date.now()) + "-" + String(attempt || 0);
          try {
            var url = new URL(raw, window.location.href);
            url.searchParams.set("__ow_retry", value);
            return url.toString();
          } catch (_err) {
            return raw + (raw.indexOf("?") >= 0 ? "&" : "?") + "__ow_retry=" + value;
          }
        }

        function addPlaceholder(img) {
          if (!img || !img.closest) return;
          var holder = img.closest(".card-image");
          if (!holder) return;
          if (holder.querySelector(".img-placeholder")) return;
          var node = document.createElement("div");
          node.className = "img-placeholder";
          node.textContent = "No image";
          holder.appendChild(node);
        }

        window.__owFallbackImage = function (img) {
          if (!img) return;
          var maxRetries = Number(img.getAttribute("data-load-max-retries") || "3");
          var retries = Number(img.getAttribute("data-load-retries") || "0");
          var currentSrc = String(img.currentSrc || img.src || "").trim();
          if (currentSrc && retries < maxRetries) {
            var nextRetry = retries + 1;
            img.setAttribute("data-load-retries", String(nextRetry));
            var retrySrc = withRetrySource(currentSrc, nextRetry);
            window.setTimeout(function () {
              if (retrySrc) img.src = retrySrc;
            }, nextRetry * 300);
            return;
          }

          var raw = img.getAttribute("data-fallback-sources") || "[]";
          var list = [];
          try {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) list = parsed;
          } catch (_err) {}

          var index = Number(img.getAttribute("data-fallback-index") || "0");
          var normalizedCurrent = normalizeSource(currentSrc);
          while (index < list.length) {
            var next = String(list[index] || "").trim();
            index += 1;
            img.setAttribute("data-fallback-index", String(index));
            if (next) {
              if (normalizeSource(next) === normalizedCurrent) continue;
              img.setAttribute("data-load-retries", "0");
              img.src = next;
              return;
            }
          }

          img.onerror = null;
          addPlaceholder(img);
          if (img.parentNode) img.parentNode.removeChild(img);
        };
      })();
    </script>
  </body>
</html>`,s=new Blob([o],{type:"text/html;charset=utf-8;"}),d=URL.createObjectURL(s),c=document.createElement("a");c.href=d,c.download="inventory-9up.html",document.body.appendChild(c),c.click(),c.remove(),URL.revokeObjectURL(d);let u=[`4-up pages downloaded (${n.length} pages).`];i>0&&u.push(`Skipped ${i} item(s) without thumbnail.`),eY(u.join(" "))}catch(e){x(e?.message??"Export failed.")}finally{q(!1)}}}async function tz(e){let t=!!e?.singleFolder;if(!V){tb(null),ey(!1),eB([]),eH(null),er(!0),eY(null),x(null);try{let{rows:e,scope:r}=await tf();if(!e.length){eY("selected"===r?"No selected rows available.":"No rows for the selected category.");return}let i=K(e),n=i.filter(e_),l=i.length-n.length;if(!n.length){eY("No rows with thumbnail/first photo for 4-up ZIP export. Add a first photo to each item.");return}let o=tA(n),s=function(e,t){let a=!!t?.singleFolder,r=new Map;return e.map(e=>{let t=tk(e.group||"Unassigned",60)||"Unassigned",i=(r.get(t)??0)+1;r.set(t,i);let n=a?`${t}_page_${i}.png`:`page_${String(i).padStart(3,"0")}.png`;return{...e,folderName:a?"":t,fileName:n}})}(o,{singleFolder:t}),d=new(await a.e(9722).then(a.t.bind(a,49722,23))).default;eY(`Rendering 0 of ${o.length} pages...`);let c=await ty({pages:s,zip:d,totalPages:o.length,renderedSoFar:0,deferFailedPages:!0}),u={zip:d,totalPages:o.length,renderedPages:c.renderedPages,skippedNoImage:l,pendingPages:c.deferredPages,unresolvedRenderedCount:0,downloadName:t?"inventory-4up-pages-flat.zip":"inventory-9up-pages.zip",singleFolder:t};if(u.pendingPages.length>0){tb(u),eB(tx(c.failedRows)),ey(!0),eY(`ZIP paused: ${u.pendingPages.length} page(s) need first-photo download. Edit the listed product cards, then click Retry & Resume ZIP.`);return}await tv(u)}catch(e){x(e?.message??"Export failed.")}finally{er(!1)}}}async function tI(){await tz({singleFolder:!1})}async function tO(){await tz({singleFolder:!0})}return i.useEffect(()=>{tu()},[]),i.useEffect(()=>{let e=tn.current;e&&(e.indeterminate=ti&&!tr)},[ti,tr]),i.useEffect(()=>{k(t=>{if(!t.size)return t;let a=new Set(e.map(e=>e.id)),r=!1,i=new Set;for(let e of t)a.has(e)?i.add(e):r=!0;return r?i:t})},[e]),i.useEffect(()=>{let e=!0;return n.OQ.from("brand_tabs").select("name").then(({data:t,error:a})=>{if(!e||a)return;let r=(t??[]).map(e=>String(e.name??"").trim()).filter(Boolean);r.length&&(H=r.filter(Boolean),J.clear(),e9(e=>e+1))}),()=>{e=!1}},[]),i.useEffect(()=>{if(!eK)return;let e=document.body.style.overflow;return document.body.style.overflow="hidden",()=>{document.body.style.overflow=e}},[eK]),(0,r.jsxs)(l.Zb,{className:eK?"fixed inset-0 z-50 w-screen h-screen max-w-none rounded-none overflow-hidden":void 0,children:[(0,r.jsxs)(l.Ol,{className:"space-y-3",children:[(0,r.jsxs)("div",{children:[r.jsx("div",{className:"text-xl font-semibold",children:"Inventory Sheet"}),r.jsx("div",{className:"text-sm text-white/60",children:"All variants listed in a spreadsheet-style view."})]}),(0,r.jsxs)("div",{className:"flex flex-wrap items-center gap-2",children:[(0,r.jsxs)("div",{className:"flex items-center gap-2",children:[r.jsx("input",{className:"h-9 w-56 rounded-md border border-white/10 bg-bg-900/60 px-3 text-xs text-white/80 placeholder:text-white/40",placeholder:"Search (name, model, JDM, EUR, US)",value:w,onChange:e=>v(e.target.value)}),w?r.jsx(s.z,{variant:"ghost",size:"sm",onClick:()=>v(""),children:"Clear"}):null]}),(0,r.jsxs)("select",{className:"h-9 rounded-md border border-white/10 bg-bg-900/60 px-2 text-xs text-white/80",value:S,onChange:e=>C(e.target.value),"aria-label":"Filter by category",children:[r.jsx("option",{value:"ALL",children:"All categories"}),te.map(e=>r.jsx("option",{value:e,children:e},e))]}),(0,r.jsxs)(o.C,{children:[tt.length," rows"]}),(0,r.jsxs)(o.C,{children:[tl," qty"]}),(0,r.jsxs)(o.C,{children:[ta.length," selected"]}),ta.length?r.jsx(s.z,{variant:"ghost",size:"sm",onClick:tc,children:"Clear selected"}):null,w?(0,r.jsxs)("span",{className:"text-xs text-white/50",children:["of ",e.length," loaded"]}):null]}),r.jsx("div",{className:"overflow-x-auto",children:(0,r.jsxs)("div",{className:"flex w-max min-w-full items-center gap-2 pb-1",children:[r.jsx(s.z,{variant:"ghost",size:"sm",onClick:()=>eQ(e=>!e),children:eK?"Exit full screen":"Full screen"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:tN,disabled:j,children:j?"Preparing...":"Download CSV"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:t$,disabled:T,children:T?"Preparing...":"Download HTML (Photos)"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:tM,disabled:G,children:G?"Preparing...":"Download 4-up (Inner Box)"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:()=>{if(tm){ey(!0);return}tI()},disabled:V,children:V?"Preparing...":tm?`Resume 4-up ZIP (${eo})`:"Download 4-up ZIP"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:()=>{if(tm){ey(!0);return}tO()},disabled:V,children:V?"Preparing...":tm?`Resume 4-up ZIP (${eo})`:"Download 4-up ZIP (One Folder)"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:tL,disabled:e2,children:e2?"Syncing...":"Sync Make/Model"}),(0,r.jsxs)("div",{className:"flex items-center gap-2",children:[(0,r.jsxs)("select",{className:"h-9 rounded-md border border-white/10 bg-bg-900/60 px-2 text-xs text-white/80",value:e0,onChange:e=>e1(e.target.value),children:[r.jsx("option",{value:"download_category",children:"Group by 4-up category"}),r.jsx("option",{value:"brand",children:"Group by brand"}),r.jsx("option",{value:"ship_class",children:"Group by class"}),r.jsx("option",{value:"ship_class_brand",children:"Class to brand"}),r.jsx("option",{value:"brand_ship_class",children:"Brand to class"}),r.jsx("option",{value:"none",children:"No folders"})]}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:tP,disabled:W,children:W?"Preparing...":"Download Cards ZIP"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:tT,disabled:eV,children:eV?"Preparing...":"Preview Card"})]}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:tE,disabled:E,children:E?"Preparing...":"Download ZIP + Photos"})]})})]}),(0,r.jsxs)(l.eW,{className:"space-y-4",children:[h?r.jsx("div",{className:"text-sm text-red-300",children:h}):null,eX?r.jsx("div",{className:"text-sm text-white/60",children:eX}):null,r.jsx("div",{className:["rounded-xl border border-white/10 bg-bg-900/30 overflow-auto",eK?"max-h-[calc(100vh-200px)]":"max-h-[70vh]"].join(" "),children:(0,r.jsxs)("table",{className:"min-w-[900px] w-full text-sm",children:[r.jsx("thead",{className:"sticky top-0 bg-bg-900/90 backdrop-blur",children:(0,r.jsxs)("tr",{className:"text-left text-white/70",children:[r.jsx("th",{className:"px-3 py-3 w-10",children:r.jsx("input",{ref:tn,type:"checkbox",className:"h-4 w-4 accent-orange-400",checked:tr,onChange:e=>td(e.target.checked),"aria-label":"Select all filtered rows"})}),r.jsx("th",{className:"px-4 py-3",children:"Photo"}),r.jsx("th",{className:"px-4 py-3",children:"Name"}),r.jsx("th",{className:"px-4 py-3",children:"Model"}),r.jsx("th",{className:"px-4 py-3",children:"Condition"}),r.jsx("th",{className:"px-4 py-3 text-right",children:"Qty"}),r.jsx("th",{className:"px-4 py-3 text-right",children:"Price"})]})}),(0,r.jsxs)("tbody",{children:[to.map(e=>(0,r.jsxs)(i.Fragment,{children:[r.jsx("tr",{className:"border-t border-white/10 bg-bg-950/40",children:(0,r.jsxs)("td",{className:"px-4 py-2 text-sm font-semibold",colSpan:7,children:[e.brand," (",e.rows.length,")"]})}),e.rows.map(e=>(0,r.jsxs)("tr",{className:"border-t border-white/5 text-white/90",children:[r.jsx("td",{className:"px-3 py-3 align-top",children:r.jsx("input",{type:"checkbox",className:"mt-1 h-4 w-4 accent-orange-400",checked:N.has(e.id),onChange:t=>ts(e.id,t.target.checked),"aria-label":`Select ${Y(e)}`})}),r.jsx("td",{className:"px-4 py-3",children:r.jsx("div",{className:"h-12 w-12 rounded-lg border border-white/10 bg-bg-900/50 overflow-hidden",children:e.product?.image_urls?.[0]?r.jsx("img",{src:ek(e.product.image_urls[0],{width:96,height:96,quality:60}),alt:"",className:"h-full w-full object-cover bg-neutral-50",loading:"lazy",decoding:"async"}):r.jsx("div",{className:"h-full w-full grid place-items-center text-[10px] text-white/40",children:"No image"})})}),r.jsx("td",{className:"px-4 py-3",children:Y(e)}),r.jsx("td",{className:"px-4 py-3 text-white/70",children:eh(e)}),r.jsx("td",{className:"px-4 py-3 text-white/70",children:ew(e.condition)}),r.jsx("td",{className:"px-4 py-3 text-right",children:Number(e.qty??0)}),r.jsx("td",{className:"px-4 py-3 text-right",children:(0,c.S)(Number(e.price??0))})]},e.id))]},e.brand)),tt.length||u?null:r.jsx("tr",{children:r.jsx("td",{colSpan:7,className:"px-4 py-6 text-center text-white/50",children:w?"No matching items.":"No items yet."})})]})]})}),u?r.jsx("div",{className:"text-sm text-white/60",children:"Loading..."}):null]}),ef?r.jsx("div",{className:"fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm p-4",children:(0,r.jsxs)("div",{className:"mx-auto flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10 bg-bg-950/95 shadow-2xl",children:[(0,r.jsxs)("div",{className:"border-b border-white/10 px-5 py-4",children:[r.jsx("div",{className:"text-lg font-semibold",children:"4-up ZIP Paused"}),(0,r.jsxs)("div",{className:"mt-1 text-sm text-white/70",children:[eD.length," product card(s) failed first-photo download. Edit those photos, then retry and resume."]})]}),(0,r.jsxs)("div",{className:"flex-1 space-y-3 overflow-auto px-4 py-4",children:[eD.map(e=>{let t=e.product?.id??e.id,a=String(e.product?.id??"").trim(),i=String(e.product?.image_urls?.[0]??"").trim(),n=eW===t;return(0,r.jsxs)("div",{className:"flex items-start gap-3 rounded-xl border border-white/10 bg-bg-900/40 p-3",children:[r.jsx("div",{className:"h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-bg-900/70",children:i?r.jsx("img",{src:ek(i,{width:128,height:128,quality:60}),alt:"",className:"h-full w-full object-cover bg-neutral-50",loading:"lazy",decoding:"async"}):r.jsx("div",{className:"grid h-full w-full place-items-center text-[10px] text-white/40",children:"No image"})}),(0,r.jsxs)("div",{className:"min-w-0 flex-1",children:[r.jsx("div",{className:"truncate text-sm font-semibold text-white",children:Y(e)}),(0,r.jsxs)("button",{type:"button",className:"mt-1 font-mono text-xs text-orange-300 underline underline-offset-2",onClick:()=>{navigator.clipboard.writeText(t).then(()=>{eH(t),window.setTimeout(()=>eH(e=>e===t?null:e),1200)}).catch(()=>void 0)},children:["Product code: ",t," ",n?"(Copied)":""]}),(0,r.jsxs)("div",{className:"mt-1 text-xs text-white/60",children:["Category: ",M(e)]})]}),r.jsx(s.z,{variant:"ghost",size:"sm",disabled:!a||!!eF,onClick:()=>void tC(a),children:eF===a?"Opening...":"Open editor"})]},e.id)}),eD.length?null:r.jsx("div",{className:"rounded-lg border border-white/10 bg-bg-900/40 p-4 text-sm text-white/60",children:"No failed rows queued."})]}),(0,r.jsxs)("div",{className:"flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-4 py-3",children:[r.jsx(s.z,{variant:"ghost",size:"sm",onClick:()=>ey(!1),children:"Close"}),r.jsx(s.z,{variant:"secondary",size:"sm",onClick:()=>window.open("/admin/inventory","_blank","noopener,noreferrer"),children:"Open Inventory"}),r.jsx(s.z,{variant:"secondary",size:"sm",disabled:V,onClick:()=>void tS(!0),children:"Finish ZIP Now"}),r.jsx(s.z,{variant:"secondary",size:"sm",disabled:V,onClick:()=>void tS(!1),children:"Retry & Resume ZIP"})]})]})}):null,r.jsx(d.H,{product:eZ,onClose:()=>{eG(null),tm&&ey(!0)},onSaved:()=>{tu()}})]})}},46080:(e,t,a)=>{"use strict";a.d(t,{AdminNav:()=>N});var r=a(10326),i=a(90434),n=a(35047),l=a(77863),o=a(35174),s=a(39744),d=a(54474),c=a(29299),u=a(71266),p=a(18751),g=a(16694),h=a(81265),f=a(99444),m=a(51914),b=a(36118),x=a(35911),w=a(74653),y=a(79611),v=a(35116),S=a(64312);let C=[{href:"/admin",label:"Dashboard",icon:o.Z},{href:"/admin/inventory",label:"Inventory",icon:s.Z},{href:"/admin/inventory/browse",label:"Inventory Browse",icon:d.Z},{href:"/admin/inventory/sheet",label:"Inventory Sheet",icon:c.Z},{href:"/admin/orders",label:"Orders / Approvals",icon:o.Z},{href:"/admin/shipments",label:"Shipping Status",icon:u.Z},{href:"/admin/sell-trade",label:"Sell / Trade Offers",icon:o.Z},{href:"/admin/sales",label:"Sales",icon:p.Z},{href:"/admin/carts",label:"Cart Insights",icon:g.Z},{href:"/cashier",label:"POS (Cashier)",icon:h.Z},{href:"/admin/brands",label:"Brand Tabs",icon:f.Z},{href:"/admin/users/tiers",label:"User Tiers",icon:m.Z},{href:"/admin/vouchers",label:"Vouchers",icon:b.Z},{href:"/announcements",label:"Announcements",icon:x.Z},{href:"/admin/notices",label:"Notice Board",icon:x.Z},{href:"/admin/bug-reports",label:"Bug Reports",icon:w.Z},{href:"/admin/feedback",label:"Customer Feedback",icon:y.Z},{href:"/admin/settings/payment-methods",label:"Payment Methods",icon:v.Z},{href:"/admin/settings",label:"Settings",icon:S.Z}];function N(){let e=(0,n.usePathname)();return r.jsx("nav",{className:"space-y-1",children:C.map(t=>{let a=e===t.href,n=t.icon;return(0,r.jsxs)(i.default,{href:t.href,className:(0,l.cn)("flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition sm:py-2 sm:text-sm",a?"border-accent-500/40 bg-accent-500/15 text-accent-900 dark:text-accent-100":"border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10"),children:[r.jsx(n,{className:"h-4 w-4"}),t.label]},t.href)})})}},40592:(e,t,a)=>{"use strict";a.d(t,{AdminMobileBar:()=>u});var r=a(10326),i=a(17577),n=a(60962),l=a(43020),o=a(8026),s=a(46080),d=a(3679),c=a(21021);function u(){let[e,t]=i.useState(!1);i.useEffect(()=>{if(!e)return;let t=document.body.style.overflow;return document.body.style.overflow="hidden",()=>{document.body.style.overflow=t}},[e]);let a=e?r.jsx("div",{className:"fixed inset-0 z-[9999] bg-black/70 p-4",onClick:()=>t(!1),children:r.jsx("div",{className:"mx-auto w-full max-w-sm",onClick:e=>e.stopPropagation(),children:(0,r.jsxs)(c.Zb,{children:[(0,r.jsxs)(c.Ol,{className:"flex items-center justify-between",children:[r.jsx("div",{className:"text-sm font-semibold text-white/80",children:"Admin Panel"}),(0,r.jsxs)(d.z,{variant:"ghost",size:"sm",onClick:()=>t(!1),children:[r.jsx(l.Z,{className:"h-4 w-4"}),"Close"]})]}),r.jsx(c.eW,{children:r.jsx(s.AdminNav,{})})]})})}):null;return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)("div",{className:"md:hidden sticky top-0 z-40 -mx-4 mb-4 flex items-center justify-between border-b border-white/5 bg-bg-950/80 px-4 py-3 backdrop-blur",children:[r.jsx("div",{className:"text-sm text-white/70",children:"Admin Panel"}),(0,r.jsxs)(d.z,{variant:"secondary",size:"sm",onClick:()=>t(!0),children:[r.jsx(o.Z,{className:"mr-2 h-4 w-4"}),"Menu"]})]}),e&&"undefined"!=typeof document?(0,n.createPortal)(a,document.body):null]})}},28800:(e,t,a)=>{"use strict";a.d(t,{Y:()=>o});var r=a(10326),i=a(17577),n=a(6920),l=a(35047);function o({children:e}){let{user:t,loading:a}=(0,n.a)(),o=(0,l.useRouter)();return(i.useEffect(()=>{a||t||o.replace("/auth/login")},[a,t,o]),a)?r.jsx("div",{className:"p-6 text-white/70",children:"Loading..."}):t?r.jsx(r.Fragment,{children:e}):null}},22939:(e,t,a)=>{"use strict";a.d(t,{RequireRole:()=>s});var r=a(10326),i=a(17577),n=a(35047),l=a(22150),o=a(28800);function s({allow:e,children:t}){return r.jsx(o.Y,{children:r.jsx(d,{allow:e,children:t})})}function d({allow:e,children:t}){let{profile:a,loading:o}=(0,l.U)(),s=(0,n.useRouter)();return(i.useEffect(()=>{o||!a||e.includes(a.role)||s.replace("/")},[o,a,e,s]),o)?r.jsx("div",{className:"p-6 text-white/70",children:"Loading..."}):a?e.includes(a.role)?r.jsx(r.Fragment,{children:t}):null:r.jsx("div",{className:"p-6 text-white/70",children:"Profile not found. Ask admin to assign your role."})}},21021:(e,t,a)=>{"use strict";a.d(t,{Ol:()=>l,Zb:()=>n,eW:()=>o,iR:()=>s});var r=a(10326);a(17577);var i=a(77863);function n({className:e,...t}){return r.jsx("div",{className:(0,i.cn)("card relative overflow-hidden rounded-2xl border border-white/10 bg-bg-900/60 shadow-soft backdrop-blur-sm","before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/5 before:via-transparent before:to-black/30 before:content-['']","after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent-500/40 after:to-transparent after:content-['']",e),...t})}function l({className:e,...t}){return r.jsx("div",{className:(0,i.cn)("card-header relative rounded-t-2xl border-b border-white/10 bg-bg-950/30 p-5 backdrop-blur-sm",e),...t})}function o({className:e,...t}){return r.jsx("div",{className:(0,i.cn)("card-body p-5",e),...t})}function s({className:e,...t}){return r.jsx("div",{className:(0,i.cn)("card-footer p-5 border-t border-white/10",e),...t})}},62194:(e,t,a)=>{"use strict";a.d(t,{Io:()=>c,O1:()=>s,fY:()=>d});let r="/storage/v1/object/public/",i="/storage/v1/render/image/public/",n=new Set;function l(e){let t=e.indexOf("#");return t>=0?e.slice(0,t):e}function o(e){let t;if(!e||e.startsWith("data:"))return null;let a=l(e);if(!(a.includes(r)||a.includes(i)))return null;try{t=new URL(a)}catch{return null}return t.pathname.includes(i)&&(t.pathname=t.pathname.replace(i,r)),t.search="",t.toString()}function s(e,t={}){if(!e||e.startsWith("data:"))return e;let a=l(e),r=o(a);return r||a}function d(e,t,a={}){return e&&o(l(e)),""}function c(e,t){if(!t||e.dataset.fallbackApplied===t)return;e.dataset.fallbackApplied=t;let a=e.currentSrc||e.src;if(a&&a.includes(i)){let e=o(t)??o(a);e&&n.add(e)}e.srcset="",e.src=t}},5776:(e,t,a)=>{"use strict";a.r(t),a.d(t,{default:()=>r});let r=(0,a(68570).createProxy)(String.raw`C:\Users\dylan\Downloads\ODD_WHEELS_POS_UPDATED\JANUARY 15 - ODD WHEELS POS\app\admin\inventory\sheet\page.tsx#default`)},84746:(e,t,a)=>{"use strict";a.r(t),a.d(t,{default:()=>s});var r=a(19510),i=a(67343),n=a(68570);let l=(0,n.createProxy)(String.raw`C:\Users\dylan\Downloads\ODD_WHEELS_POS_UPDATED\JANUARY 15 - ODD WHEELS POS\components\AdminNav.tsx#AdminNav`),o=(0,n.createProxy)(String.raw`C:\Users\dylan\Downloads\ODD_WHEELS_POS_UPDATED\JANUARY 15 - ODD WHEELS POS\components\admin\AdminMobileBar.tsx#AdminMobileBar`);function s({children:e}){return r.jsx(i.q,{allow:["admin"],children:(0,r.jsxs)("main",{className:"admin-compact mx-auto max-w-8xl px-2 py-8 sm:px-4",children:[r.jsx(o,{}),(0,r.jsxs)("div",{className:"grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]",children:[(0,r.jsxs)("aside",{className:"hidden h-fit md:sticky md:top-24 md:block",children:[r.jsx("div",{className:"mb-3 text-sm text-white/60",children:"Admin Panel"}),r.jsx(l,{})]}),r.jsx("section",{className:"min-w-0",children:e})]})]})})}},67343:(e,t,a)=>{"use strict";a.d(t,{q:()=>r});let r=(0,a(68570).createProxy)(String.raw`C:\Users\dylan\Downloads\ODD_WHEELS_POS_UPDATED\JANUARY 15 - ODD WHEELS POS\components\auth\RequireRole.tsx#RequireRole`)},36118:(e,t,a)=>{"use strict";a.d(t,{Z:()=>r});let r=(0,a(9664).Z)("Ticket",[["path",{d:"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",key:"qn84l0"}],["path",{d:"M13 5v2",key:"dyzc3o"}],["path",{d:"M13 17v2",key:"1ont0d"}],["path",{d:"M13 11v2",key:"1wjjxi"}]])}};var t=require("../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),r=t.X(0,[8948,4649,8578,1021,7139],()=>a(88106));module.exports=r})();