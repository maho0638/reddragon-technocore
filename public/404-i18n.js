(()=>{
  const strings={
    tr:{title:"Bu bağlantı artık burada değil.",description:"Eski veya hatalı bir site içi bağlantıya geldin. Ana panele dön; DID, proof, X/Medium paylaşımı ve GitHub ajan kurulumu orada.",home:"Ana panele dön",languageLabel:"Dil / Language"},
    en:{title:"This link is no longer here.",description:"You reached an old or invalid internal link. Return to the home panel for DID, proof, X/Medium sharing, and GitHub agent setup.",home:"Return to home",languageLabel:"Language / Dil"}
  };
  const select=document.querySelector("#rd404Language");
  function apply(lang){const value=strings[lang]?lang:"en";document.documentElement.lang=value;document.title=`404 · RedDragon Technocore Agent Lab`;for(const node of document.querySelectorAll("[data-i18n]")){node.textContent=strings[value][node.dataset.i18n]||node.textContent;}select.value=value;try{localStorage.setItem("reddragon-lang",value);}catch{}}
  let initial="en";try{initial=localStorage.getItem("reddragon-lang")||"en";}catch{}
  select.addEventListener("change",()=>apply(select.value));apply(initial);
})();
