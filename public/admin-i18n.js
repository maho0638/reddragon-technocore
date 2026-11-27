export function mountLanguage(catalog){
  const picker=document.querySelector("#pageLanguage");if(!picker)return;
  const saved=localStorage.getItem("rdFlopLanguage")==="tr"?"tr":"en";
  const paint=lang=>{localStorage.setItem("rdFlopLanguage",lang);document.documentElement.lang=lang;for(const el of document.querySelectorAll("[data-i18n]")){const value=catalog[lang]?.[el.dataset.i18n];if(value)el.textContent=value;}};
  picker.value=saved;picker.addEventListener("change",()=>paint(picker.value));paint(saved);
}
export function currentLanguage(){return localStorage.getItem("rdFlopLanguage")==="tr"?"tr":"en";}
