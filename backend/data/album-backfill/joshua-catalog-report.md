# backfillAlbumFromJoshuaCatalog 報告 —— Phase B(joshua.com.tw 官網 catalog)

> org=約書亞樂團。生成時間:2026-08-17 13:28:56(--dry,DB 未寫入)

- 候選 row 總數:1082
- match 到單一專輯且已寫(或 --dry 模擬):0
- match 到但撞多隻專輯(衝突,冇寫):74
- match 到但 DB 已有 album(冇覆寫):869
- match 到但 album_source=manual/legacy(受保護,冇覆寫):0
- catalog 搵唔到:139
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):87.2%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 219 | 5hkbct1UPK8 | 【找到我 / Bring Me Back】 - ft. 璽恩 SiEnVanessa | 找到我 | 父的筵席 / 父的筵席(Acoustic) |
| 232 | 9nfLo2xVaRA | 【天父祢都看顧 / Father, You See It All】(Acoustic Live) Music Video - ft. 璽恩 SiEnVanessa陳州邦 | 天父祢都看顧 | 父的筵席 / 父的筵席(Acoustic) |
| 6595 | _7JtJTP-87Y | 【Shout for Freedom】lyric music videos - Joshua Band feat.Mikhala Janay Gittens | Shout for Freedom | Lift High Your Name / 呼喊自由 |
| 6604 | is236gZ1XUM | 【定睛於祢 / Fix My Eyes on You】Acoustic Live - 謝思穎 Panay Isak | 定睛於祢 | 卸下冠冕 / 如同橄欖樹 Like An Olive Tree (Acoustic Live) |
| 6615 | DLq5xtwdSb8 | 【定睛於祢 / Fix My Eyes on You】Acoustic Live - 謝思穎 Panay Isak | 定睛於祢 | 卸下冠冕 / 如同橄欖樹 Like An Olive Tree (Acoustic Live) |
| 6616 | qlXQl-f2IYU | 【同負一軛 / Yoked Together】官方歌詞 - 馬勝恩 Asiwa Mavaliw、高承恩 Kevin Gao、鄭牧德 Darren Cheng | 同負一軛 | 呼喊自由 / 我願降服 |
| 6624 | EGMV2y4UE50 | 【同負一軛 / Yoked Together】Live Video - 馬勝恩 Asiwa Mavaliw、高承恩 Kevin Gao、鄭牧德 Darren Cheng | 同負一軛 | 呼喊自由 / 我願降服 |
| 6627 | GIjl_YiHpHw | 【穿越 / Through All Trials】Live Video - 曾子瑄 Dorcas Tseng | 穿越 | 父的筵席 / 父的筵席(Acoustic) |
| 6634 | _nTWaBTky0w | 【在祢殿中 / Here in Your House】 - Gateway Worship ft. 、張育恩 Daniel Chang | 在祢殿中 | 卸下冠冕 / 傾倒我全所有 |
| 6684 | VTN0fArJ4KM | 大衛帳幕的榮耀【在祢殿中/ Stay In Your Court】 | 在祢殿中 | 卸下冠冕 / 傾倒我全所有 |
| 6685 | BKnhP94Fuvs | 大衛帳幕的榮耀【在祢殿中 / Stay In Your Court】Live Video - 陳州邦 Ben Chen | 在祢殿中 | 卸下冠冕 / 傾倒我全所有 |
| 6800 | tYMqoweZwDk | 【我永遠相信 / I'll Always Believe】Live Worship - KUA GLOBAL 跨越, 鄭牧德 | 我永遠相信 | 父的筵席 / 父的筵席(Acoustic) |
| 7022 | 5JtrxhBXo6c | 【我永遠相信 / I’ll Always Believe】Live Worship - ft. 陳州邦 | 我永遠相信 | 父的筵席 / 父的筵席(Acoustic) |
| 7080 | WFGvOtlcp38 | 【祢真好 / You Are Good】(Planetshakers) Live Worship - CROSSMAN、趙治達 | You Are Good | 呼喊自由 / 主掌權 / 愛贏了 |
| 7105 | CGdqbWRL670 | 【完美時刻 / Perfect Timing】Live Worship - ft. 陳州邦、林芊秀 | 完美時刻 | 父的筵席 / 父的筵席(Acoustic) |
| 7116 | dtwIGjVz1U0 | 【我要大聲唱 / Gonna Sing Aloud】Live Worship - ft. 林芊秀 | 我要大聲唱 | 父的筵席 / 父的筵席(Acoustic) |
| 7130 | poBD5w1iz8M | 【我們同心宣告 / We Proclaim As One】Live Worship - ft. 璽恩 SiEnVanessa | 我們同心宣告 | 父的筵席 / 父的筵席(Acoustic) |
| 7161 | Hw7-RKKXvo0 | 【同負一軛 / Yoked Together】Music Video - 曾晨恩 | 同負一軛 | 呼喊自由 / 我願降服 |
| 7179 | iW7pjQ9HGes | 【祢的呼喚 / Your Calling】Music Video - 曾晨恩、璽恩 SiEnVanessa | 祢的呼喚 | 我願降服 / Acoustic Live數位專輯〈我願降服〉 |
| 7184 | v2mAwWx5Fj0 | 【祢的呼喚 / Your Calling】 - 曾晨恩、璽恩 SiEnVanessa | 祢的呼喚 | 我願降服 / Acoustic Live數位專輯〈我願降服〉 |
| 7216 | SlPy_esl6iI | 【同負一軛 / Yoked Together】 - 曾晨恩 | 同負一軛 | 呼喊自由 / 我願降服 |
| 7227 | 1DNGpUNfaFc | 【祢的呼喚 / Your Calling】(Acoustic Live) Music Video - 璽恩 SiEnVanessa、曾晨恩、謝思穎、陳州邦 | 祢的呼喚 | 我願降服 / Acoustic Live數位專輯〈我願降服〉 |
| 7269 | VwVMi8DNPns | 【天父祢都看顧 / Father, You See It All】Music Video - ft. 周巽光 | 天父祢都看顧 | 父的筵席 / 父的筵席(Acoustic) |
| 7270 | cA21W0hAmQo | 【我永遠相信 / I'll Always Believe】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 我永遠相信 | 父的筵席 / 父的筵席(Acoustic) |
| 7271 | -9oIPEuFEj8 | 【主是我拯救 / Lord, My Savior】(Acoustic Live) - ft. 璽恩 SiEnVanessa、陳州邦 | 主是我拯救 | 父的筵席 / 父的筵席(Acoustic) |
| 7272 | sHESy5aw4kQ | 【父的筵席 / Feast of the Father】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 父的筵席 | 父的筵席 / 父的筵席(Acoustic) |
| 7273 | jTUKrkNytFw | 【天父祢都看顧 / Father, You See It All】(Acoustic Live) - ft. 璽恩 SiEnVanessa、陳州邦 | 天父祢都看顧 | 父的筵席 / 父的筵席(Acoustic) |
| 7274 | M2nMX_OB3DU | 【完美時刻 / Perfect Timing】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 完美時刻 | 父的筵席 / 父的筵席(Acoustic) |
| 7275 | LwjXTVobNkY | 【大地復興 / Revival in the Land】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 大地復興 | 父的筵席 / 父的筵席(Acoustic) |
| 7276 | F_nmRdefwWg | 【我們同心宣告 / We Proclaim As One】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 我們同心宣告 | 父的筵席 / 父的筵席(Acoustic) |
| 7277 | Bcxkpup3HVM | 【我要大聲唱 / Gonna Sing Aloud】(Acoustic Live) - ft. 璽恩 SiEnVanessa、陳州邦 | 我要大聲唱 | 父的筵席 / 父的筵席(Acoustic) |
| 7278 | Ox6Gmzbz12c | 【祢在我身後 / You Look After Me】(Acoustic Live) - ft. 璽恩 SiEnVanessa、陳州邦 | 祢在我身後 | 父的筵席 / 父的筵席(Acoustic) |
| 7279 | 2WgspAkXZU4 | 【是因為祢 / Because of You】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 是因為祢 | 父的筵席 / 父的筵席(Acoustic) |
| 7280 | tV4dpsBsX4c | 【找到我 / Bring Me Back】(Acoustic Live) - ft. 陳州邦、璽恩 SiEnVanessa | 找到我 | 父的筵席 / 父的筵席(Acoustic) |
| 7281 | fwSt4gbhIuM | 【穿越 / Through All Trials】(Acoustic Live) - ft. 璽恩 SiEnVanessa、陳州邦 | 穿越 | 父的筵席 / 父的筵席(Acoustic) |
| 7282 | z6XLKWzruqQ | 【我永遠相信 / I'll Always Believe】 - ft. 周巽光 | 我永遠相信 | 父的筵席 / 父的筵席(Acoustic) |
| 7283 | nFeMi8UO6kE | 【大地復興 / Revival in the Land】 - 曾晨恩、璽恩 SiEnVanessa | 大地復興 | 父的筵席 / 父的筵席(Acoustic) |
| 7284 | _WXBjJEZ_dM | 【完美時刻 / Perfect Timing】 - ft. 陳州邦、曹之懿 | 完美時刻 | 父的筵席 / 父的筵席(Acoustic) |
| 7286 | llZ0ncJqL1w | 【是因為祢 / Because of You】 - ft. 趙治德 | 是因為祢 | 父的筵席 / 父的筵席(Acoustic) |
| 7288 | XXuDexH1xbQ | 【天父祢都看顧 / Father, You See It All】 - ft. 周巽光 | 天父祢都看顧 | 父的筵席 / 父的筵席(Acoustic) |
| 7289 | Og3P2nhn3yU | 【父的筵席 / Feast of the Father】 - ft. 陳州邦 | 父的筵席 | 父的筵席 / 父的筵席(Acoustic) |
| 7290 | JBPjyqxWmvE | 【穿越 / Through All Trials】 - ft. 璽恩 SiEnVanessa | 穿越 | 父的筵席 / 父的筵席(Acoustic) |
| 7291 | Grw7vnXimT8 | 【我要大聲唱 / Gonna Sing Aloud】 - ft. 李曉茹 | 我要大聲唱 | 父的筵席 / 父的筵席(Acoustic) |
| 7292 | BTCzIDowcV4 | 【我們同心宣告 / We Proclaim As One】 - ft. 曹之懿 | 我們同心宣告 | 父的筵席 / 父的筵席(Acoustic) |
| 7293 | 3fYd-N-eEfE | 【祢在我身後 / You Look After Me】 - ft. 陳雅玲 | 祢在我身後 | 父的筵席 / 父的筵席(Acoustic) |
| 7295 | rrDLLxBo3Qk | 【大地復興 / Revival in the Land】Music Video - 曾晨恩、璽恩SiEnVanessa | 大地復興 | 父的筵席 / 父的筵席(Acoustic) |
| 7296 | BrH2qIYt5a8 | 【完美時刻 / Perfect Timing】Music Video - ft. 陳州邦、曹之懿 | 完美時刻 | 父的筵席 / 父的筵席(Acoustic) |
| 7310 | YQsC__vMb-c | 【我永遠相信 / I’ll Always Believe】Music Video - ft. 周巽光 | 我永遠相信 | 父的筵席 / 父的筵席(Acoustic) |
| 7311 | cZRwXRYZ9tU | 【是因為祢 / Because of You】Music Video - ft. 趙治德 | 是因為祢 | 父的筵席 / 父的筵席(Acoustic) |
| 7312 | 463GWqFF7oo | 【我要大聲唱 / Gonna Sing Aloud】Music Video - ft. 李曉茹 | 我要大聲唱 | 父的筵席 / 父的筵席(Acoustic) |
| 7313 | sr-Oh6mD_Do | 【穿越 / Through All Trials】Music Video - ft. 璽恩 SiEnVanessa | 穿越 | 父的筵席 / 父的筵席(Acoustic) |
| 7316 | 9Eor5Spje6A | 【祢真好 / You Are Good】(Planetshakers) - ft. Sidney Mohede | You Are Good | 呼喊自由 / 主掌權 / 愛贏了 |
| 7321 | Avm0tK8p_mo | 【祢真好 / You Are Good】(Gateway Worship) - ft. 璽恩 SienVanessa | You Are Good | 呼喊自由 / 主掌權 / 愛贏了 |
| 7327 | -CYEa79YLlw | 【因為祢真好 / You Are Good】 - ft. 陳州邦 | You Are Good | 呼喊自由 / 主掌權 / 愛贏了 |
| 7328 | TMDlNsSTaoI | 【我們同心宣告 / We Proclaim As One】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 我們同心宣告 | 父的筵席 / 父的筵席(Acoustic) |
| 7329 | LjqtyEuCjcc | 【我永遠相信 / I'll Always Believe】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 我永遠相信 | 父的筵席 / 父的筵席(Acoustic) |
| 7330 | zZ4iDeIm4rk | 【祢在我身後 / You Look After Me】(Acoustic Live) Music Video - ft. 璽恩 SiEnVanessa、陳州邦 | 祢在我身後 | 父的筵席 / 父的筵席(Acoustic) |
| 7331 | TYKWsqFLnz4 | 【主是我拯救 / Lord, My Savior】(Acoustic Live) Music Video - ft. 璽恩 SiEnVanessa、陳州邦 | 主是我拯救 | 父的筵席 / 父的筵席(Acoustic) |
| 7332 | w6iwmaVYI2Y | 【找到我 / Bring Me Back】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 找到我 | 父的筵席 / 父的筵席(Acoustic) |
| 7377 | sig7WISX34c | 【父的筵席 / Feast of the Father】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 父的筵席 | 父的筵席 / 父的筵席(Acoustic) |
| 7381 | grPyqrNwYSQ | 【大地復興 / Revival in the Land】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 大地復興 | 父的筵席 / 父的筵席(Acoustic) |
| 7382 | D1NSSA6RG5g | 【是因為祢 / Because of You】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 是因為祢 | 父的筵席 / 父的筵席(Acoustic) |
| 7383 | 9Dq1bRIfBuU | 【完美時刻 / Perfect Timing】(Acoustic Live) Music Video - ft. 陳州邦、璽恩 SiEnVanessa | 完美時刻 | 父的筵席 / 父的筵席(Acoustic) |
| 7384 | YqIZQDAAb-0 | 【天父祢都看顧】 feat.周巽光 | 天父祢都看顧 | 父的筵席 / 父的筵席(Acoustic) |
| 7385 | OYk-z_7qaZE | 【我要大聲唱 / Gonna Sing Aloud】(Acoustic Live) Music Video - ft. 璽恩 SiEnVanessa、陳州邦 | 我要大聲唱 | 父的筵席 / 父的筵席(Acoustic) |
| 7386 | Pd--RiCjLHg | 【完美時刻 / Perfect Timing】Live Worship - ft. 陳州邦、璽恩 SiEnVanessa | 完美時刻 | 父的筵席 / 父的筵席(Acoustic) |
| 7387 | CK2eJ_T0SHY | 【穿越 / Through All Trials】(Acoustic Live) Music Video - ft. 璽恩 SiEnVanessa、陳州邦 | 穿越 | 父的筵席 / 父的筵席(Acoustic) |
| 7389 | R-wBxPYu2U8 | 【找到我 / Bring Me Back】Live Worship - ft. 璽恩 SiEnVanessa | 找到我 | 父的筵席 / 父的筵席(Acoustic) |
| 7391 | 4nMj7F-smJM | 【穿越 / Through All Trials】Live Worship - ft. 璽恩 SiEnVanessa | 穿越 | 父的筵席 / 父的筵席(Acoustic) |
| 7392 | g5a-OYmmP0U | 【我要大聲唱 / Gonna Sing Aloud】Live Worship - ft. 李曉茹 | 我要大聲唱 | 父的筵席 / 父的筵席(Acoustic) |
| 7399 | TpW-6r_0XUo | 【大地復興 / Revival in the Land】Live Worship - 曾晨恩、璽恩 SiEnVanessa | 大地復興 | 父的筵席 / 父的筵席(Acoustic) |
| 7430 | aMO3k9wmSdI | 【是因為祢 / Because of You】Live Worship - ft. 趙治德 | 是因為祢 | 父的筵席 / 父的筵席(Acoustic) |
| 7491 | 5fWje7IXYsU | 【祢真好 / You Are Good】(Gateway Worship) Music Video - ft. 璽恩 SienVanessa | You Are Good | 呼喊自由 / 主掌權 / 愛贏了 |
| 7493 | Q0qMoU32X58 | 【祢真好 / You Are Good】(Planetshakers) Music Video - ft. Sidney Mohede | You Are Good | 呼喊自由 / 主掌權 / 愛贏了 |

(catalog 搵唔到嘅 139 首、DB 已有 album 冇覆寫嘅 869 首、
album_source=manual/legacy 受保護嘅 0 首,唔逐條列,見上面統計數字。)
