import re
js=open("D:/Viston/frontend/app/components/Logo.js",encoding="utf8").read()
g=lambda n:re.search(rf"const {n} = '([^']+)'",js).group(1)
CHECK,VEE,WORD=g("CHECK"),g("VEE"),g("WORD")
DEFS='''<defs>
<linearGradient id="gold" x1="60" y1="0" x2="150" y2="230" gradientUnits="userSpaceOnUse"><stop stop-color="#FFE884"/><stop offset=".5" stop-color="#F5C518"/><stop offset="1" stop-color="#A9841A"/></linearGradient>
<linearGradient id="silver" x1="200" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#9C9C9C"/></linearGradient>
<linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2E2A1D"/><stop offset=".55" stop-color="#17140D"/><stop offset="1" stop-color="#0E0D0A"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F5C518" stop-opacity=".5"/><stop offset=".5" stop-color="#F5C518" stop-opacity=".08"/><stop offset="1" stop-color="#F5C518" stop-opacity=".2"/></linearGradient>
</defs>'''
MARK=f'<path d="{VEE}" fill="url(#gold)"/><path d="{CHECK}" fill="url(#silver)"/>'
def svg(vb,body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{DEFS}{body}</svg>'
open("simbolo.svg","w").write(svg("0 0 280.746 230",MARK))
s=.9; tx=(500-280.746*s)/2; ty=(500-230*s)/2
open("simbolo-icone.svg","w").write(svg("0 0 500 500",f'<rect x="1" y="1" width="498" height="498" rx="112" fill="url(#plate)" stroke="url(#rim)" stroke-width="2"/><g transform="translate({tx:.1f} {ty:.1f}) scale({s})">{MARK}</g>'))
ms=234/280.746
open("horizontal-escuro.svg","w").write(svg("0 0 738.937 191.704",f'<g transform="scale({ms:.4f})">{MARK}</g><g transform="translate(247 {(191.704-91.52)/2-1.536:.2f})"><path d="{WORD}" fill="#FFFFFF"/></g>'))
open("empilhado-escuro.svg","w").write(svg("0 0 503 405",f'<g transform="translate({(503-280.746)/2:.1f} 0)">{MARK}</g><g transform="translate(5.5 313)"><path d="{WORD}" fill="#FFFFFF"/></g>'))
