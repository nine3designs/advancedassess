 (function(){
   'use strict';
   var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

   /* --- header condense --- */
   var header = document.getElementById('header');
   function onScroll(){ header.classList.toggle('scrolled', window.scrollY > 24); }
   window.addEventListener('scroll', onScroll, {passive:true});
   onScroll();

   /* --- mobile nav: real close button, backdrop, Esc, scroll lock --- */
   var toggle = document.getElementById('navToggle');
   var links = document.getElementById('navLinks');
   if(toggle && links){
     var mq = window.matchMedia('(max-width:880px)');

     /* close button — injected, so no HTML edits are needed */
     var closeBtn = document.createElement('button');
     closeBtn.type = 'button';
     closeBtn.className = 'nav-close';
     closeBtn.setAttribute('aria-label','Close menu');
     closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';
     var closeLi = document.createElement('li');
     closeLi.className = 'nav-close-item';
     closeLi.appendChild(closeBtn);
     links.insertBefore(closeLi, links.firstChild);

     /* dimmed backdrop — tap anywhere outside the menu to close */
     var backdrop = document.createElement('div');
     backdrop.className = 'nav-backdrop';
     backdrop.setAttribute('aria-hidden','true');
     document.body.appendChild(backdrop);

     function openNav(){
       links.classList.add('open');
       document.body.classList.add('nav-open');
       toggle.setAttribute('aria-expanded','true');
       if(mq.matches) closeBtn.focus();
     }
     function closeNav(){
       links.classList.remove('open');
       document.body.classList.remove('nav-open');
       toggle.setAttribute('aria-expanded','false');
     }
     toggle.addEventListener('click', function(){
       if(links.classList.contains('open')){ closeNav(); } else { openNav(); }
     });
     closeBtn.addEventListener('click', closeNav);
     backdrop.addEventListener('click', closeNav);
     document.addEventListener('keydown', function(e){
       if(e.key === 'Escape' && links.classList.contains('open')){ closeNav(); toggle.focus(); }
     });
     links.addEventListener('click', function(e){
       var t = e.target;
       if(t.closest ? t.closest('a') : t.tagName === 'A') closeNav();
     });
     /* if the window grows past the mobile breakpoint while open, reset cleanly */
     function onMq(e){ if(!e.matches) closeNav(); }
     if(mq.addEventListener) mq.addEventListener('change', onMq);
     else if(mq.addListener) mq.addListener(onMq);
   }

   /* --- reveal on scroll (staggered) --- */
   var revealEls = document.querySelectorAll('.reveal');
   if('IntersectionObserver' in window && !reduceMotion){
     var io = new IntersectionObserver(function(entries){
       entries.forEach(function(entry){
         if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
       });
     }, {threshold:.18, rootMargin:'0px 0px -40px 0px'});
     revealEls.forEach(function(el){ io.observe(el); });
   } else {
     revealEls.forEach(function(el){ el.classList.add('in'); });
   }

   /* --- animated counters --- */
   var counters = document.querySelectorAll('.counter');
   function runCounter(el){
     var target = parseInt(el.getAttribute('data-count'), 10) || 0;
     if(reduceMotion){ el.textContent = target; return; }
     var start = null, dur = 1600;
     function step(ts){
       if(!start) start = ts;
       var p = Math.min((ts - start) / dur, 1);
       var eased = 1 - Math.pow(1 - p, 4);
       el.textContent = Math.round(eased * target);
       if(p < 1) requestAnimationFrame(step);
     }
     requestAnimationFrame(step);
   }
   if('IntersectionObserver' in window){
     var cio = new IntersectionObserver(function(entries){
       entries.forEach(function(entry){
         if(entry.isIntersecting){ runCounter(entry.target); cio.unobserve(entry.target); }
       });
     }, {threshold:.6});
     counters.forEach(function(el){ cio.observe(el); });
   } else {
     counters.forEach(runCounter);
   }
 })();
