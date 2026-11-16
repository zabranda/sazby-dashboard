# Sazby

Veřejný přehled korunového úrokového swapu (CZK IRS) a ceníkových sazeb hypoték s tříletou fixací. Stránka neobsahuje žádná osobní data: žádná jména, čísla smluv, výše úvěrů ani adresy. Jsou na ní jen veřejné tržní řady a názvy bank.

## Co dashboard ukazuje

- 3Y CZK IRS, jeho týdenní a měsíční změnu, ceník Air Bank a sazbu pro aktivní klienty.
- Spread ceníku proti IRS a rezervu proti sazbě Raiffeisenbank (5,45 % minus sazba aktivních klientů Air Bank).
- Fixing EUR/CZK a USD/CZK.
- Graf IRS (1Y a 5Y lze přepnout) se schodovitou sazbou Air Bank, pásmem 5,10–5,20 % a čárou Raiffeisenbank.
- Spread v čase a čáru 40 bp.
- Sekci „Co hýbe 3Y CZK IRS“: české, eurové, americké a globální faktory.
- Pořadí faktorů podle korelace týdenních (u inflace měsíčních) změn a hrubý přepočet na sazbu hypotéky. Je to statistický vztah z historie, ne kauzální model.
- Tabulku ručně zadaných bankovních ceníků.

Odpočet ukazuje zasedání ČNB 17. 12. 2026 a datum 1. 2. 2027.

## Odkud jsou data

Automaticky, skriptem `scripts/update_rates.py`:

| Řada | Zdroj |
| --- | --- |
| CZK IRS 1Y, 3Y, 5Y | Patria, střed nákupu a prodeje. Starší 3Y historie je přibližný odečet z grafu (±3 bp) a v souboru má `quality=approximate`. |
| EUR/CZK, USD/CZK | Denní fixing ČNB. Když FRED u EUR/USD skončí dřív, novější dny se doplní z ECB. |
| 2T repo | Textová historie ČNB. |
| PRIBOR 3M | Roční soubory ČNB. |
| Inflace ČR | ČSÚ, otevřená data, meziroční růst indexu spotřebitelských cen za úhrn. |
| HICP eurozóny | Eurostat, datová sada `prc_hicp_manr`, geo EA, coicop CP00. Veřejné API teď končí prosincem 2025. |
| 2Y eurová sazba | ECB, spot sazba 2Y na AAA výnosové křivce. Není to přímo německý Schatz ani EUR IRS; bližší denní řada bez registrace nebyla k dispozici. |
| Depozitní sazba ECB | FRED `ECBDFR`, jinak řada ECB. |
| US Treasury 2Y a 10Y | FRED `DGS2` a `DGS10`, jinak CSV amerického ministerstva financí. |
| Inflace USA | FRED `CPIAUCSL`, meziroční změna indexu. Jinak BLS CPI-U. |
| Fed funds | FRED `DFEDTARU` (horní hranice), jinak tabulka Fedu. |
| EUR/USD | FRED `DEXUSEU`, jinak ECB, jinak poměr fixingů ČNB. |
| Brent | FRED `DCOILBRENTEU`, jinak EIA. |
| Air Bank | Stránka se jen kontroluje. Ceník se sám nepřepisuje. |

Ručně:

- `data/bank_rates.csv` — aktuální ceníky bank.
- `data/airbank_3y.csv` — historie ceníku Air Bank.
- `data/cz_bond_3y.csv` — volitelně výnos 3letého českého státního dluhopisu. ČNB ARAD tuto řadu bez API klíče nevydá a jiný spolehlivý soubor se nepodařilo najít, proto se hodnoty nevymýšlejí. Až soubor doplníte, dashboard i korelace ho použijí.

Když stažení selže, skript nechá poslední soubor a neskončí chybou.

## Jak se data aktualizují

GitHub Actions workflow `Aktualizace sazeb` běží v pracovní dny v 17:00 UTC a dá se spustit ručně (`workflow_dispatch`). Spustí `python scripts/update_rates.py` a commitne změny ve složce `data/`.

Lokálně:

```bash
python3 scripts/update_rates.py
```

Potřeba je jen Python 3.11+ ze standardní knihovny.

## Jak upravit sazby bank

V `data/bank_rates.csv` je řádek na banku a období:

```text
date_effective,bank,rate_pct,note
2026-11-16,Air Bank,5.29,"Ceník bez slev. Aktivní klienti 5,19 %."
```

`rate_pct` je roční sazba v procentech, desetinná tečka. Poznámku s čárkou dejte do uvozovek. Novou sazbu přidejte jako další řádek se dnem, od kterého platí. Dashboard u každé banky ukáže jen řádek s nejnovějším `date_effective` a seřadí banky podle sazby.

Historie Air Bank je v `data/airbank_3y.csv`:

```text
date_effective,rate_pct,active_rate_pct,note,quality
2026-10-23,5.29,5.19,"aktivní klienti",manual
```

`active_rate_pct` vyplňte jen tam, kde sleva pro aktivní klienty platí. `quality` nechte `manual`.

Výnos dluhopisu, až ho budete mít z ARAD nebo jiného ověřeného zdroje:

```text
date,value,quality,source
2026-11-13,4.11,manual,arad
```

## Nasazení

GitHub Pages bere větev `main` a kořen repozitáře (složka `/`). Soubor `.nojekyll` je v kořeni schválně, aby Pages nespouštěly Jekyll. Adresa je [https://zabranda.github.io/sazby-dashboard/](https://zabranda.github.io/sazby-dashboard/).

Když Pages nejsou zapnuté: v repozitáři **Settings → Pages → Build and deployment → Source: Deploy from a branch**, větev **main**, složka **/ (root)** a uložit.
