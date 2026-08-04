# backfillAlbumFromCatalog 報告 —— Phase B(sop.org catalog)

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 3。org=讚美之泉/讚美之泉兒童/讚美之泉粵語。生成時間:2026-08-04 05:07:48(--dry,DB 未寫入)

- 候選 row 總數:1397
- match 到單一專輯且已寫(或 --dry 模擬):468
- match 到但撞多隻專輯(衝突,冇寫):170
- match 到但 DB 已有 album(冇覆寫):11
- catalog 搵唔到:748

## 已寫(或 --dry 模擬)清單

| id | youtube_id | title | album |
|---|---|---|---|
| 210 | BUAl5KsR-VI | 耶穌基督 Lord, Jesus Christ | 這是我們的敬拜 |
| 211 | WC6bCBSgNtQ | 奔跑不放棄 Won't Give Up | 新的事將要成就 |
| 212 | US6S0B3ECJ8 | 俯伏 Bow Down | 平安 |
| 213 | KvNBVA9gcTQ | 深深地敬拜 Deeply, I Worship | 讚美中信心不斷升起 |
| 215 | bWOBTBdURZo | 這是我們的敬拜 This Is Our Worship | 這是我們的敬拜 |
| 217 | 3LIs-V8zQHU | 謝謝你成為我的家 You're My Home | 深愛耶穌 |
| 218 | whIXb8D93Go | 我揚聲敬拜 I Lift My Voice To You | 我能給你什麼 |
| 716 | bxtO97hA6Hc | 照亮我生命的光 | 這是我們的敬拜 |
| 4087 | 5MbwlftMWig | 有何神像祢 Lord, Who Is Like You | 這是我們的敬拜 |
| 4088 | 6nkfZUaSX7I | 我已經與基督同釘十架 I Have Been Crucified with Christ | 這是我們的敬拜 |
| 4089 | Yspgt392WSk | 唯一的使命 The Great Commission | 這是我們的敬拜 |
| 4090 | OytAWXgbmzM | 從我興起 Revival Starts with Me | 這是我們的敬拜 |
| 4091 | lMXeS5AZcco | 不需要理由 I Don't Need a Reason | 這是我們的敬拜 |
| 4092 | 1qlZAw-L3ng | 雨過會天晴 (耶穌耶穌我呼求祢) Sunshine After the Rain (How I Need You) | 這是我們的敬拜 |
| 4099 | uMAsfjcw7EU | 定睛在耶穌身上 Jesus, Set My Eyes on You | 這是我們的敬拜 |
| 4101 | ikQR5bQaBZE | 吹起復興的風 The Wind of Revival | 這是我們的敬拜 |
| 4102 | BXEujGWfN3c | 就是現在 Right Here, Right Now | 這是我們的敬拜 |
| 4103 | VTTcS_lS27Q | 就是現在 Right Here, Right Now | 這是我們的敬拜 |
| 4104 | eK4dYZi6kFo | 照亮我生命的光 The Light That Fills My Life | 這是我們的敬拜 |
| 4112 | VtkBvHS9t50 | 定睛在耶穌身上 Jesus, Set My Eyes on You | 這是我們的敬拜 |
| 4113 | 6eNiVEag8YM | 耶穌基督 Lord, Jesus Christ | 這是我們的敬拜 |
| 4114 | IJZpTe5uqqA | 越過 Over Mountains and Valleys | 這是我們的敬拜 |
| 4115 | 9GsGWPq2vUI | 讓我更深更深地來愛祢 Falling Deeper and Deeper | 這是我們的敬拜 |
| 4116 | 4G-nBRv2S5Q | 我真渴望與祢相遇 How I Long to Meet with You | 這是我們的敬拜 |
| 4123 | mYXedsCXN38 | 一路不孤單 We Are Not Alone | 這是我們的敬拜 |
| 4125 | TS7ipeIWBx8 | 有何神像祢 Lord, Who Is Like You | 這是我們的敬拜 |
| 4126 | PCAw5pJIbi8 | 我已經與基督同釘十架 I Have Been Crucified with Christ | 這是我們的敬拜 |
| 4127 | 7HpN5QyEZts | 唯一的使命 The Great Commission | 這是我們的敬拜 |
| 4128 | 341P7cRTFiU | 從我興起 Revival Starts with Me | 這是我們的敬拜 |
| 4135 | 5PT4qPGw3s4 | 不需要理由 I Don't Need a Reason | 這是我們的敬拜 |
| 4136 | 0L8E2HbbYUU | 雨過會天晴 (耶穌耶穌我呼求祢) Sunshine After the Rain (How I Need You) | 這是我們的敬拜 |
| 4137 | k0e7VVu3th8 | 這是我們的敬拜 This Is Our Worship | 這是我們的敬拜 |
| 4138 | kCVVVIYwFJI | 吹起復興的風 The Wind of Revival | 這是我們的敬拜 |
| 4175 | 29o0ik0TCXU | 聖潔的羔羊 The Holy Lamb of God | 深愛耶穌 |
| 4184 | wfRTudoNLkc | 聖潔的羔羊 The Holy Lamb of God | 深愛耶穌 |
| 4185 | scb45GwoRPw | 為榮耀的創造 Made For Your Glory | 深愛耶穌 |
| 4186 | A56QphOOgv0 | 我的耶穌 My Jesus | 深愛耶穌 |
| 4195 | AFZmF8d9p9M | 我的耶穌 My Jesus | 深愛耶穌 |
| 4196 | q01p1cR7vQg | 為榮耀的創造 Made For Your Glory | 深愛耶穌 |
| 4197 | bKuz6nFeuqk | 披上讚美衣 The Robe Of Praise | 深愛耶穌 |
| 4199 | FZDs3X9HxfM | 不要忘記 I Won't Forget | 深愛耶穌 |
| 4207 | dnsbaB1dtio | 披上讚美衣 The Robe Of Praise | 深愛耶穌 |
| 4208 | rhvqjM8Ov6Q | 不要忘記 I Won't Forget | 深愛耶穌 |
| 4209 | dhJCJcGojHA | 不停讚美祢 Won't Stop Praising | 深愛耶穌 |
| 4210 | 5dFdkTWZqIU | 和散那，歡迎君王 Hosanna, Here Comes The King | 深愛耶穌 |
| 4211 | pYyAWPTxg_w | 和散那，歡迎君王 Hosanna, Here Comes The King | 深愛耶穌 |
| 4212 | RAacozf9irg | 不停讚美祢 Won't Stop Praising | 深愛耶穌 |
| 4219 | y5aMAbQe5JQ | 謝謝你成為我的家 You're My Home | 深愛耶穌 |
| 4220 | f_Zcl01ivog | 向我的神獻上感謝 I Give My Thanks To You, My God | 深愛耶穌 |
| 4221 | 1rSsM9d9KyI | 深愛耶穌 Loving Jesus | 深愛耶穌 |
| 4222 | sZTAHWca92Q | 向我的神獻上感謝 I Give My Thanks To You, My God | 深愛耶穌 |
| 4223 | X8gAuY5yZeA | 深愛耶穌 Loving Jesus | 深愛耶穌 |
| 4229 | Locik5cCLIo | 今天是神所定的日子 This Is the Day (That Our God Has Made) | 唱出耶穌的偉大 |
| 4232 | kdW2nYVU8OY | 唱出耶穌的偉大 I Will Sing of Your Greatness | 唱出耶穌的偉大 |
| 4233 | IFk08np_3sY | 禱告！禱告！天父都知道 I Pray, I Pray, for He Knows My Heart | 唱出耶穌的偉大 |
| 4234 | wptN5VPRU-A | 每天住在祢裡面 Each Day Abiding in You | 唱出耶穌的偉大 |
| 4237 | LUtYcmIqek0 | 今天是神所定的日子 This Is the Day (That Our God Has Made) | 唱出耶穌的偉大 |
| 4239 | 1JwrN_s6Tuc | 每天住在祢裡面 Each Day Abiding in You | 唱出耶穌的偉大 |
| 4240 | wBBlIB0lG4w | 唱出耶穌的偉大 I Will Sing of Your Greatness | 唱出耶穌的偉大 |
| 4250 | r0SRHwtAfn8 | 敬畏上帝的人有福 Happy Are Those Who Fear The Lord | 耶穌是我最好的朋友 |
| 4252 | JzpzWnXC-lA | 耶穌是我最好的朋友 My Very Best Friend | 耶穌是我最好的朋友 |
| 4253 | HgUebKzMuBI | 跟隨祢步伐 (向前向後、向左向右) Follow After You (To The Front And Back) | 耶穌是我最好的朋友 |
| 4254 | R439SvTJUrM | 小王子、小公主 Princes And Princesses | 耶穌是我最好的朋友 |
| 4257 | vt5jXALBpEM | 小王子、小公主 Princes And Princesses | 耶穌是我最好的朋友 |
| 4259 | ulPTZnyOkak | 敬畏上帝的人有福 Happy Are Those Who Fear The Lord | 耶穌是我最好的朋友 |
| 4262 | Ll2po8K89Ik | 跟隨祢步伐 (向前向後、向左向右) Follow After You (To The Front And Back) | 耶穌是我最好的朋友 |
| 4264 | zWDZ7TSykgM | 耶穌是我最好的朋友 My Very Best Friend | 耶穌是我最好的朋友 |
| 4265 | yGYSCEdz8N4 | 主耶穌，謝謝祢 My Jesus , Thank You | 耶穌是我最好的朋友 |
| 4274 | PS0htQB9dwc | 萬物都來唱哈利路亞 All Creation Sings Hallelujah | 耶穌是我最好的朋友 |
| 4287 | 34uYS_qm31I | 太陽出來了 The Sun Is Shining Now | 盡情地微笑 |
| 4294 | cnFb_5azwBg | 有耶穌，不害怕 Jesus, You're In My Heart | 盡情地微笑 |
| 4296 | MYHusbx_mJA | 我要來大聲讚美祢 Loudest Praise | 盡情地微笑 |
| 4854 | Ry6dYmM5Vfg | 一起仰望耶穌 Jesus, We Look To You | 我能給你什麼 |
| 4855 | oa5J37-Ngq8 | 一起仰望耶穌 Jesus, We Look To You | 我能給你什麼 |
| 4856 | 12_4TPmkzGs | 有一件事 One Thing I Desire | 我能給你什麼 |
| 4863 | PxyymEGFPkA | 有一件事 One Thing I Desire | 我能給你什麼 |
| 4865 | dhP3ejJYa7s | 浪子的我 Once I Was Lost | 我能給你什麼 |
| 4866 | bcrN87xqGi8 | 浪子的我 Once I Was Lost | 我能給你什麼 |
| 4867 | OomemUi9dnY | 我活著要稱頌祢 With My Life, I'll Bring You Praise | 我能給你什麼 |
| 4875 | hfNEM3uJfYc | 我選擇喜樂 I Will Be Joyful | 我能給你什麼 |
| 4876 | f9TS-YfY-I8 | 我選擇喜樂 I Will Be Joyful | 我能給你什麼 |
| 4877 | 3UUCvyTStfQ | 藏身之處 My Hiding Place | 我能給你什麼 |
| 4878 | a230Fmo_ZNQ | 藏身之處 My Hiding Place | 我能給你什麼 |
| 4879 | Xty8LD0jtvA | 與祢漫步 The Garden | 我能給你什麼 |
| 4880 | pkbZ3ihO81s | 與祢漫步 The Garden | 我能給你什麼 |
| 4887 | GGiphRkJ_jk | 那麼深的渴慕 My Deepest Longing | 我能給你什麼 |
| 4888 | nsCq25XyCp0 | 那麼深的渴慕 My Deepest Longing | 我能給你什麼 |
| 4889 | Ev-5WpIZNEg | 我敬拜祢，耶穌 I Worship You, Jesus | 我能給你什麼 |
| 4890 | twtbq9Y5_u8 | 我敬拜祢，耶穌 I worship You Jesus | 我能給你什麼 |
| 4891 | CGaTvceKIrs | 我揚聲敬拜 I Lift My Voice To You | 我能給你什麼 |
| 4892 | -HrtC0IhuqQ | 主啊，我們敬畏祢 O Lord, We Exalt Thee | 我能給你什麼 |
| 4899 | RZ9A40dz_q4 | 主啊，我們敬畏祢 O Lord, We Exalt Thee | 我能給你什麼 |
| 4900 | YDKx_bzW3-c | 耶和華是應當稱頌的 We Sing Praises To The Lord, Yahweh | 我能給你什麼 |
| 4901 | M8F3BZ_vjWI | 耶和華是應當稱頌的 We Sing Praises To The Lord, Yahweh | 我能給你什麼 |
| 4902 | GgbO2UqdtqM | 只願有耶穌 The Only One I Want | 我能給你什麼 |
| 4903 | GGr0erJKScw | 只願有耶穌 The Only One I Want | 我能給你什麼 |
| 4904 | hRMkJ7iA4hg | 不管世界如何看我 No Matter How The World Sees Me | 我能給你什麼 |
| 4911 | MnlYcZFRl2I | 不管世界如何看我 No Matter How The World Sees Me | 我能給你什麼 |
| 4912 | mVqSmWIjoZU | 好喜歡與你在一起 I Really Love To Be With You | 我能給你什麼 |
| 4913 | KpvMg3nh0Fo | 好喜歡與你在一起 I Really Love To Be With You | 我能給你什麼 |
| 4916 | ozwcBC4Or8o | 我能給你什麼 What Could I Bring To You | 我能給你什麼 |
| 4923 | -papSSttSyE | 我能給你什麼 What Could I Bring To You | 我能給你什麼 |
| 4939 | bOjHd5Q0wcA | 愛祢直到永遠 Loving You Forever | 恢復敬拜 |
| 4940 | S3I645qD9BI | 數不盡 Grace Beyond All Measure | 恢復敬拜 |
| 4947 | sMfnRiO925A | 高舉雙手敬拜 Lift My Hands To Worship | 恢復敬拜 |
| 4948 | _svIQ4gpPeY | 數不盡 Grace Beyond All Measure | 恢復敬拜 |
| 4949 | tZkklxa-mIw | 敬拜耶穌 We Worship You, Oh Jesus | 恢復敬拜 |
| 4950 | fchrOQRH0UY | 敬拜耶穌 We Worship You, Oh Jesus | 恢復敬拜 |
| 4957 | AUtllLPxIJQ | 愛祢直到永遠 Loving You Forever | 恢復敬拜 |
| 4958 | qKu9gQMMXro | 十架的大能 The Power Of The Cross | 恢復敬拜 |
| 4967 | TaCqFTGNKGQ | 十架的大能 The Power Of The Cross | 恢復敬拜 |
| 4969 | HjdVX8nLRrE | 恢復敬拜 Revive Our Worship | 恢復敬拜 |
| 4970 | mnuc-Ec0cMQ | 恢復敬拜 Revive Our Worship | 恢復敬拜 |
| 4972 | zPw4JLB_AJ4 | 我全然獻上 This Is My Offering | 恢復敬拜 |
| 4979 | bhksO1rcDk4 | 賜福在這地 Send Thy Blessing On This Land | 恢復敬拜 |
| 4980 | Y830DxbORsA | 我全然獻上 This Is My Offering | 恢復敬拜 |
| 4981 | fSQoYDr5MXY | 賜福在這地 Send Thy Blessing On This Land | 恢復敬拜 |
| 4983 | 0NoyScMg82I | 祢永遠活著 Forever You Live | 最珍貴的角落 |
| 4992 | QU6JUsWSmb8 | 【聖誕特別單曲】榮耀歸於至高真神 All The Glory To The Most High | 聖誕EP特輯 |
| 4998 | cyWZbe3RDS8 | 榮耀歸於至高真神 All The Glory To The Most High | 聖誕EP特輯 |
| 5001 | a5P_6v5Fn6U | 愛的約定 The Promise Of Love | 聖誕EP特輯 |
| 5007 | U8NlvgPXor8 | 煉淨過的生命 A Purified Life | 讚美中信心不斷升起 |
| 5008 | Rk5ZxB-Q5tg | 天父祢愛我 The Love Of My Life | 讚美中信心不斷升起 |
| 5009 | hvtbb267tdM | 煉淨過的生命 A Purified Life | 讚美中信心不斷升起 |
| 5014 | kK4_u7Zi-iw | 天父祢愛我 The Love Of My Life | 讚美中信心不斷升起 |
| 5015 | O_vAPfJNBpo | 深深地敬拜 Deeply, I Worship | 讚美中信心不斷升起 |
| 5016 | kGn_KJ9Dj4s | 聖潔和榮耀 Holy And Glorious | 讚美中信心不斷升起 |
| 5017 | dJa4wE-4o-E | 聖潔和榮耀 Holy And Glorious | 讚美中信心不斷升起 |
| 5022 | MAorTjzpVw0 | 我心堅定於祢 My Heart's Steadfast On You | 讚美中信心不斷升起 |
| 5023 | Sl1R3zUMugc | 我心堅定於祢 My Heart's Steadfast On You | 讚美中信心不斷升起 |
| 5024 | R5Lt-cVIG_c | 榮耀至高神 Glory In The Highest | 讚美中信心不斷升起 |
| 5025 | 1hViPloUb9o | 曠野中唯一的力量 My Strength In The Wilderness | 讚美中信心不斷升起 |
| 5030 | muAPDa2WY_s | 榮耀至高神 Glory In The Highest | 讚美中信心不斷升起 |
| 5031 | 7Lk8rq3y-rM | 曠野中唯一的力量 My Strength In The Wilderness | 讚美中信心不斷升起 |
| 5038 | VLMxUO-mF2w | 是祢，耶穌 It's You, Jesus | 讚美中信心不斷升起 |
| 5039 | WI8nmkpZhVw | 是祢，耶穌 It's You, Jesus | 讚美中信心不斷升起 |
| 5040 | lspZOQhpu30 | 愛祢，是我一生的呼召 I Live My Life To Love You | 讚美中信心不斷升起 |
| 5041 | jSOLchYQdoQ | 爭戰得勝在於祢 The Battle Belongs To You | 讚美中信心不斷升起 |
| 5046 | XlldqQcA9fQ | 爭戰得勝在於祢 The Battle Belongs To You | 讚美中信心不斷升起 |
| 5047 | I6U_dcCUygo | 愛祢，是我一生的呼召 I Live My Life To Love You | 讚美中信心不斷升起 |
| 5048 | yFQn424qMKg | 讚美中信心不斷升起 Let Faith Arise In Our Praises | 讚美中信心不斷升起 |
| 5049 | 2SIMjdhneZg | 我是承載神榮耀的器皿 Carry God's Glory | 讚美中信心不斷升起 |
| 5054 | nJmMyMn4JLQ | 讚美中信心不斷升起 Let Faith Arise In Our Praises | 讚美中信心不斷升起 |
| 5055 | Z3RbUC1kL5Y | 我是承載神榮耀的器皿 Carry God's Glory | 讚美中信心不斷升起 |
| 5066 | Jk3D7Arq8T0 | 【聖誕特別版】在至高之處 In the Highest | 我要看見 |
| 5067 | VajFZVKyd48 | 【聖誕特別單曲】愛的約定 The Promise Of Love | 聖誕EP特輯 |
| 5101 | bqKLaKS-C9I | 最大的福分 The Blessing | 聽見這世代的呼喚 |
| 5103 | 3peuIsY-ig4 | 我是被主重價買回的人 I Am Redeemed | 聽見這世代的呼喚 |
| 5104 | afPt9siHU1E | 讓我尋見祢 Seek And Find | 聽見這世代的呼喚 |
| 5112 | RYt4K4YOgDo | 我們等候愛慕耶穌 Deeply Adore You | 聽見這世代的呼喚 |
| 5113 | bklkzggFi94 | 獻上讚美祭 Sacrifice Of Praise | 聽見這世代的呼喚 |
| 5115 | N-bI8_Cc7E4 | 聽見這世代的呼喚 Hear Our Cry | 聽見這世代的呼喚 |
| 5116 | uFt0WyrJsXU | 蒙恩 Favor In Your Eyes | 聽見這世代的呼喚 |
| 5117 | K18iPCTdU8M | 讓我尋見祢 Seek And Find | 聽見這世代的呼喚 |
| 5124 | oMCzxRjGd_A | 頌讚歸於祢 Taste And See | 聽見這世代的呼喚 |
| 5125 | JG2K7gjrOg4 | 祢就是唯一 You're The Only One | 聽見這世代的呼喚 |
| 5126 | U7ZNB-ShmNk | 厚恩待我 Your Grace Covers Me | 聽見這世代的呼喚 |
| 5127 | AiGFDnmibUY | 我是被主重價買回的人 I Am Redeemed | 聽見這世代的呼喚 |
| 5128 | FUMrok5yvWo | 最大的福分 The Blessing | 聽見這世代的呼喚 |
| 5129 | N5WekcPMC8o | 我們等候愛慕耶穌 Deeply Adore You | 聽見這世代的呼喚 |
| 5136 | cxDQ5YpYXlA | 獻上讚美祭 Sacrifice Of Praise | 聽見這世代的呼喚 |
| 5141 | AFVN3V3Tc0w | 聽見這世代的呼喚 Hear Our Cry | 聽見這世代的呼喚 |
| 5154 | nMJ7VXOVjdQ | 真實的悔改 Turn My Life To You | 不要放棄・滿有能力 |
| 5155 | u8wF_dYoS8o | 耶和華我的磐石 Jehovah, You Are My Rock | 不要放棄・滿有能力 |
| 5164 | NLJ5-uPpGrg | 倚靠 Trust | 不要放棄・滿有能力 |
| 5165 | SC2Nu_MZsGA | 我高舉雙手 I Give You My All | 不要放棄・滿有能力 |
| 5236 | wlCGhahaPE4 | 萬軍之耶和華 Almighty Jehovah | 讓讚美飛揚 |
| 5239 | _B0tbnxHPVw | 是耶穌 It's Jesus | 彩虹下的約定 |
| 5249 | _qe3tGd5gKQ | 舉目向山 I Lift Up My Eyes To The Mountains | 耶和華祝福滿滿 |
| 5261 | oPSt3UuV8SQ | 尋找 Searching | 彩虹下的約定 |
| 5262 | ivPWBePtk2Y | 生命的凱歌 Victorious Life | 耶和華祝福滿滿 |
| 5263 | cBtL7zw8Duo | 更深渴慕祢 Deeper Longing | 展開清晨的翅膀 |
| 5270 | wh1JIRoJ8wA | 犧牲的愛 The Sacrificial Love | 耶和華祝福滿滿 |
| 5275 | f3pRJO8n0ws | 豐盛的人生 Abundant Life | 甦醒 |
| 5282 | dbWRfcX3NTY | 與你有約 The Promise | 彩虹下的約定 |
| 5286 | GTbSQh0LOnE | 我的心，你要稱頌耶和華 Praise The Lord, O My Soul | 甦醒 |
| 5287 | eg6iLKyKi0Y | 愛 喜樂 生命 Love, Joy And Life | 耶和華祝福滿滿 |
| 5297 | Pf1EFYDuONM | 誰能像祢 Who Is Like You | 讓讚美飛揚 |
| 5298 | OQPy_JsfjVE | 天父的孩子 Father's Beloved Child | 彩虹下的約定 |
| 5306 | _xf3qbTsRX8 | 生命的舵手 The Navigator of My Life | 讓讚美飛揚 |
| 5318 | 9JBI5gjsDjM | 甦醒 Awakening | 甦醒 |
| 5320 | 6nXHzdZLldc | 從今天起 From This Day On | 耶和華祝福滿滿 |
| 5321 | 3LkDgc4xXVw | 激起生命的浪花 The Journey Through the Waves | 彩虹下的約定 |
| 5330 | BvqsBBSqKAo | 主賜福如春雨 Rain of Blessings | 耶和華祝福滿滿 |
| 5332 | 7JDohpxeT4I | 賜我自由 Grant Me Freedom | 彩虹下的約定 |
| 5334 | 4IL5XRVttM4 | 給我清潔的心 Create In Me A Clean Heart | 甦醒 |
| 5343 | h1a6qLC8y1k | 何等榮耀美麗的主 Lord, You Are Beautiful | 我在這裡 |
| 5344 | -xbLosDjnIE | 何等榮耀美麗的主 Lord, You Are Beautiful | 我在這裡 |
| 5347 | ikhwTK0aeHs | 祢是我的詩歌 You Are My Song | 我在這裡 |
| 5354 | og0FXpNYngQ | 祢是我的詩歌 You Are My Song | 我在這裡 |
| 5355 | BOiDtz81UcQ | 偉大的神 Great Is Our God | 我在這裡 |
| 5356 | G8dbdA21f2M | 偉大的神 Great Is Our God | 我在這裡 |
| 5357 | o6Wcd-WMRR4 | I Will Sing Hallelujah [我要唱哈利路亞] | 我在這裡 |
| 5358 | s9Z4bjgUzLg | I Will Sing Hallelujah [我要唱哈利路亞] | 我在這裡 |
| 5359 | f_x8HgBgc4Y | 聖靈的火 Fire, Come Down | 我在這裡 |
| 5366 | pmSmBtZ9rNg | 聖靈的火 Fire Come Down | 我在這裡 |
| 5367 | yN2vsA3xi4A | 大山可以挪開 [主的慈愛] The Mountains Shall Depart | 我在這裡 |
| 5368 | 8DUlxLBbH5E | 祢的救恩 Your Salvation | 我在這裡 |
| 5369 | tGzEf8pYZqg | 大山可以挪開 [主的慈愛] The Mountains Shall Depart | 我在這裡 |
| 5370 | dg1Rp4OHlg8 | 祢的救恩 Your Salvation | 我在這裡 |
| 5371 | h5YPo_MmBds | 得勝的宣告 You Are My Victory | 我在這裡 |
| 5378 | 1GtjzGdw-Ao | 得勝的宣告 You Are My Victory | 我在這裡 |
| 5379 | qimRnA-V4sg | 耶穌永遠掌權 You Reign Forevermore | 我在這裡 |
| 5380 | ri8YXb7TNEo | 耶穌永遠掌權 You Reign Forevermore | 我在這裡 |
| 5391 | dK2rSkmWEzA | 我在這裡 Here I Am | 我在這裡 |
| 5392 | g6yLxC-m9oI | 我在這裡 Here I Am | 我在這裡 |
| 5394 | QTTlqWbHWE4 | 天堂在我心 Heaven is In My Heart | 全新的你 |
| 5402 | y3QzV2WE-qw | 耶和華祢是我的神 Jehovah, You Are My God | 全新的你 |
| 5403 | mICtENJfB0Y | 年歲的冠冕 The Crown of the Ages | 全新的你 |
| 5404 | PVxCVNghAl4 | 進入祢的同在 Into Your Presence | 全新的你 |
| 5406 | Z9occ2nTWvc | 榮耀都歸祢 Glory To You | 全新的你 |
| 5407 | T06B5lYsHV0 | 全新的你 A New You | 全新的你 |
| 5414 | -6ngRNFnP9c | 我主我的神 My Lord, My God | 全新的你 |
| 5415 | HORmso8M0-o | 彼此相愛 Love One Another | 全新的你 |
| 5416 | 8pEpoGzHJgY | 我一生要讚美祢 I'll Praise You All My Life | 全新的你 |
| 5417 | xSYa1uj9tV4 | 復興的火 The Fire of Revival | 全能的創造主 |
| 5418 | aDFBbMRRjEs | 我心要稱謝耶和華 My Heart Will Praise the Lord | 全能的創造主 |
| 5426 | qXqXcWDqeZA | 永活全能的神 Almighty Living God | 全能的創造主 |
| 5427 | PtiQt4n4Afs | 傾聽我的心 Listen to My Heart | 全能的創造主 |
| 5431 | 2GbxXhvdhhA | 願祢國降臨 Your Kingdom Come | 全能的創造主 |
| 5439 | -58zzjhqLU8 | 常常喜樂 Rejoice Always | 全能的創造主 |
| 5442 | wFYQpoWIaDo | 耶穌，超乎萬名之名 Jesus, Name Above All Names | 展開清晨的翅膀 |
| 5450 | du_Z8xWIU8M | 復興聖潔 Revive Holiness [粵語版] | 展開清晨的翅膀 |
| 5451 | xpxpR9RDU4g | 在祢手中 In Your Hands | 展開清晨的翅膀 |
| 5454 | I6pYYmO6uLw | 我願觸動祢心弦 Lord, I Want To Touch Your Heart | 展開清晨的翅膀 |
| 5455 | oCCZv94fMG8 | 萬國禱告的殿 House of Prayer | 展開清晨的翅膀 |
| 5462 | L04ZzS43PRA | 主禱文 The Lord's Prayer | 展開清晨的翅膀 |
| 5463 | K3ibf2AjR3U | 復興聖潔 Revive Holiness | 展開清晨的翅膀 |
| 5464 | FxnPovZksls | 願祢榮耀國度降臨 Your Glorious Kingdom Come | 展開清晨的翅膀 |
| 5500 | IexgIoY1Drc | 願為主閃亮 Shine for the Lord | 讓愛走動 |
| 5501 | Mh30ySsBDO0 | 陪我走 Walk With Me | 讓愛走動 |
| 5502 | TJ2Bv5kjdV4 | 改變我，改變世界 Change Me, Change the World | 讓愛走動 |
| 5503 | w9760CWenIQ | 仰望恩典 Upon Your Grace | 讓愛走動 |
| 5510 | CSgqVMb0JnY | 秋雨之福 Autumn Blessings | 讓愛走動 |
| 5511 | x5jMhLY75Iw | 在主愛中 In God's Love | 讓愛走動 |
| 5513 | 9YAafdqp76k | 萬物充滿祢的恩典 [閩南語] All Creations Filled by Your Love | 讓愛走動 |
| 5514 | MksWyFsHemY | 奇妙的愛 Amazing Love | 讓愛走動 |
| 5515 | h9T5_RZ7ZuQ | 祢使我雙腳跳舞 Set My Feet to Dancing | 讓愛走動 |
| 5536 | dBee0GgPzrU | 慈愛天父 God of Mercy | 深觸我心 |
| 5538 | rE2eJTFfcgA | 聖潔的敬拜 The Purest Worship | 深觸我心 |
| 5546 | red766Ot8cU | 邁向新的生命 A Brand New Life | 深觸我心 |
| 5548 | CPheUkhCrd8 | 榮耀羔羊 Glorious King | 深觸我心 |
| 5550 | qwn3eKjZiEs | 我全心頌讚 I Will Praise You | 深觸我心 |
| 5559 | ZE4jUfVSQgQ | 深觸我心 How Precious You are to Me | 深觸我心 |
| 5582 | PXfBvOJEtiI | 祢美好應許 Your Promise | 單單只為你 |
| 5583 | OrqtK5h9VEw | 單單只為祢 For You Alone | 單單只為你 |
| 5584 | yk1xBkP3lAc | 耶和華坐著為王 Lord, You Sit Enthroned | 單單只為你 |
| 5585 | ygElrkZ0X9U | 我心切切渴慕祢 My Heart Shall Long For You | 單單只為你 |
| 5586 | xuQbmwSIt9E | 沙崙的玫瑰 Rose of Sharon | 單單只為你 |
| 5594 | u9o2q1NfE6c | 主我跟祢走 Lord, I Walk With You | 單單只為你 |
| 5595 | qxl-qcVwxQ8 | 全地當讚美 The Whole Earth Will Sing | 單單只為你 |
| 5596 | oR5vjYYi9Ew | 聖潔全能主 Holy Is The Lord | 單單只為你 |
| 5599 | HyvE5TWY9NM | 耶和華尼西 Jehovah Nissi | 單單只為你 |
| 5606 | 5SRbnxAX0Aw | 禱告 I Pray | 單單只為你 |
| 5610 | wBrkCBRJs2o | 求聽我呼求 Hear My Voice | 似乎在天堂 |
| 5618 | dYlY_m49-UE | 寧靜谷 Valley Of Peace | 似乎在天堂 |
| 5620 | _vmi5t2hm1M | 這就是你的愛 Your Love Is Amazing | 似乎在天堂 |
| 5622 | OlIHTsHeG-0 | 聖誕之願 A Wish For Christmas | 似乎在天堂 |
| 5623 | EGFyatxX4pk | 我要常常喜樂 I Will Always Rejoice | 似乎在天堂 |
| 5630 | Dic9lxN_kAk | 似乎在天堂 Just Like Heaven | 似乎在天堂 |
| 5631 | DKfG_kniofo | 簡單的歌 A Simple Song | 似乎在天堂 |
| 5647 | VHmzXIMGvhc | 只需要祢 All I Need - SOP NEXT | High to the Sky |
| 5688 | Lp-QwrvsikQ | 專心來愛祢 Set My Heart on You | 平安 |
| 5689 | 1vYPuvDb8x0 | 安靜等候祢 Wait on You | 平安 |
| 5702 | SjsLPdlZIgU | 君尊的祭司 A Royal Priest | I Believe |
| 5703 | 01eMxoEV2bo | 在祢同在裡 In Your Presence | 平安 |
| 5727 | wTbh8oSyZTY | 祂從高處伸手 Rescued Me | I Believe |
| 5734 | V0JQp2McVx8 | 安靜等候祢 Wait on You | 平安 |
| 5735 | AfWZ-1taIfw | 禱告的力量 The Power of Prayer | I Believe |
| 5736 | 4Ko8q10lZZ8 | 專心來愛祢 Set My Heart on You | 平安 |
| 5737 | R2Qp127TYUk | 祂從高處伸手 Rescued Me | I Believe |
| 5738 | l_xTymMbV-8 | 在乎耶和華 All Because of You | 平安 |
| 5739 | 3LP4Gm0dU94 | 發現愛 Found Love | 平安 |
| 5746 | VsojhU-Jyy8 | 天父 My Abba Father | I Believe |
| 5747 | Djex-p7z7lI | 君尊的祭司 A Royal Priest | I Believe |
| 5748 | Vg7qLy4LxhU | 被愛 Loved by You | 平安 |
| 5749 | w7LiijVv_R8 | 在耶穌裡彼此相愛 Let Us Love | I Believe |
| 5751 | 7Jes9i8JrxA | 無盡恩典 Amazing Grace | 平安 |
| 5755 | ZGgwogpDMLI | 得勝的歌 Song of Victory | I Believe |
| 5757 | a6EfKsYHpFU | 平安 [粵語] Peace | 平安 |
| 5758 | yqIvw4KH0yY | 祢永遠如此深愛著我 More Than I Could Know | I Believe |
| 5759 | TvRHFJ4xEuw | 來向耶和華歌唱 Come and Sing | I Believe |
| 5760 | SFFxx1LXrKo | 俯伏 Bow Down | 平安 |
| 5761 | 6O7-bExd3PM | 深深愛慕祢 Deeply Adore You | 平安 |
| 5763 | b0wEsXeWB6I | 我在這裡敬拜 Here to Worship | 平安 |
| 5765 | fsUVkm142O4 | 在祢同在裡 In Your Presence | 平安 |
| 5766 | UBDyViNTQxw | 充滿在這裡 Fill This Place | I Believe |
| 5769 | 6FSJPwaT9Hk | 天父 My Abba Father | I Believe |
| 5770 | v76-wz1mv8w | 祢的恩典夠我用 Your Grace Is Enough | 平安 |
| 5771 | VJTtPXR-pUE | 平安 Peace | 平安 |
| 5772 | 00Q27A-bnJ4 | 得勝的歌 Song of Victory | I Believe |
| 5776 | ShPPQxkkWBE | 祢眼目必看顧這地 Your Eyes Are Always on the Land | I Believe |
| 5813 | gaBoKZmTNws | 哀哭變為跳舞 Mourning into dancing | 最珍貴的角落 |
| 5814 | RVA_Le5AJtk | 耶穌的愛 The Love of Jesus | 最珍貴的角落 |
| 5815 | NMD0V9IIj9k | 神是我們的避難所 You Are My Refuge | 最珍貴的角落 |
| 5816 | w43QIZ79YbY | 勇敢走出去 Stepping Out | 最珍貴的角落 |
| 5817 | _OGXH5_83w4 | 因著十架 By the Cross | 最珍貴的角落 |
| 5818 | -3klPYCsIFs | 祢使我生命美麗 You Have Made My Life Beautiful | 最珍貴的角落 |
| 5819 | vwGFHVXuGaM | 選擇相信 I Choose To Believe | 最珍貴的角落 |
| 5820 | uOtZygZLOPg | 祢的愛 Your Love | 最珍貴的角落 |
| 5821 | BYmkvU78_lU | 生命的話語 Speak To Me | 最珍貴的角落 |
| 5822 | 2syCVOnZi08 | 專愛 One Love | 最珍貴的角落 |
| 5823 | -c1VP8AgFig | 只因祢 Because of You | 最珍貴的角落 |
| 5825 | 7GppzVMPoEo | 煉淨我 Cleanse Me, Lord | 不要放棄・滿有能力 |
| 5826 | 1m7MZHDzL-4 | 這是聖潔之地 This Is Holy Ground | 不要放棄・滿有能力 |
| 5828 | lI7O8Ta-8aw | 耶和華行了大事 The Lord Has Done Great Things For Us | 不要放棄・滿有能力 |
| 5829 | Bs-pQZ9b0OU | 我要全心讚美 My Heart Will Praise You, Lord | 愛可以再更多一點點 |
| 5830 | XI-vbohSYic | 願天歡喜 Heavens Rejoice | 愛可以再更多一點點 |
| 5831 | 1jlQz4s3KP8 | 最珍貴的角落 Precious Corner | 最珍貴的角落 |
| 5833 | Yp_-szRK08E | 聖潔歸於祢 Holy Are You, Lord | 不要放棄・滿有能力 |
| 5835 | AQdv5MjhnNs | 不要放棄 Do Not Give Up | 不要放棄・滿有能力 |
| 5836 | V5kzmt2S-Z4 | 耶穌祢醫治 Jesus, You Heal | 不要放棄・滿有能力 |
| 5837 | L1Qu1uAVTS0 | 信實的神 You Are Faithful | 不要放棄・滿有能力 |
| 5841 | m3sn2txZ7EQ | 我要一心稱謝祢 Lord, I Praise with All of my Heart | 愛可以再更多一點點 |
| 5842 | z1iXfIObFIA | 齊為此地呼求 Cry Out for the Land | 愛可以再更多一點點 |
| 5843 | ZNSG2CG5DNQ | 豐盛的應許 By Faith, I Receive | 愛可以再更多一點點 |
| 5844 | YkgK5rNLpP8 | 單單愛祢 I Love You, Lord | 愛可以再更多一點點 |
| 5847 | YbjV48U3DjM | 耶穌，來得著這地 Come and Rule This Land | 相信有愛就有奇蹟 |
| 5848 | Rm6hJ_PuZ8Y | 轉化 Transformation | 相信有愛就有奇蹟 |
| 5849 | MQ8NkGwLv1k | 八福 The Beatitudes | 相信有愛就有奇蹟 |
| 5858 | RbtjMHE1XSY | 從心合一 Unity | 從心合一 |
| 5859 | QFGc0KDqeDE | 帶我進入祢的同在 Take Me into Your Holy Place | 從心合一 |
| 5866 | X55CSgjTqlA | 大手牽著小手 Hand in Hand | 這裡有榮耀 |
| 5867 | hWSaYRD6118 | 以馬內利 Emmanuel | 這裡有榮耀 |
| 5869 | iyE6XFy1_cU | 更多充滿 Come Overflow | 這裡有榮耀 |
| 5876 | 0JjM9JBIjmg | 永恆唯一的盼望 The Hope of Our Lives | 這裡有榮耀 |
| 5877 | kNnZXzsNYPo | 從這代到那代 From Now till Evermore | 這裡有榮耀 |
| 5878 | Muq6RNaLjgU | 愛中相遇 See You Face to Face | 這裡有榮耀 |
| 5879 | 8sAHiAwy7WI | 賜生命的主 Giver of Life | 永遠尊貴 |
| 5903 | mABOnus5A3s | 祢是聖潔 You Are Holy | 寶貴十架 |
| 5927 | xoTJTtoAQx8 | 聖靈降下恩雨 Holy Spirit Rain Down | 寶貴十架 |
| 5933 | qA3r-6O3HoA | 敬拜祢 We Worship You | 寶貴十架 |
| 5936 | FynX-Z87vJU | 揀選 Chosen | 寶貴十架 |
| 5937 | 6dIGgEY_roE | 活石 Living Stones | 寶貴十架 |
| 5945 | 1MFGUd12VDo | 這世代 This Generation | 寶貴十架 |
| 5947 | UiN8wdqxle0 | 聖哉聖哉聖哉 Holy, Holy, Holy | 寶貴十架 |
| 5948 | FOHcx647Tq0 | 齊為此地呼求 Cry Out for the Land | 愛可以再更多一點點 |
| 5954 | uid2WjB9WbU | 唯有耶穌 Jesus, You Can | 相信有愛就有奇蹟 |
| 5955 | qHiQf_D-OMc | 尊貴全能神 Almighty God | 相信有愛就有奇蹟 |
| 5957 | gMBAPZCVHXY | 感謝天父 Thank You, Father | 相信有愛就有奇蹟 |
| 5958 | Wrd7P2KkFaA | 叫我抬起頭的神 The Lifter of My Head | 相信有愛就有奇蹟 |
| 5959 | GovwcxYUgRo | 轉化 Transformation | 相信有愛就有奇蹟 |
| 5968 | xGrJwHAv4uM | 主祢是我盼望 Lord, You Are My Hope | 相信有愛就有奇蹟 |
| 5969 | vKnmhGvQPnU | 豐盛的應許 By Faith, I Receive | 愛可以再更多一點點 |
| 5970 | rYAgvT_IUtU | 我要一心稱謝祢 Lord, I Praise with All of My Heart | 愛可以再更多一點點 |
| 5971 | 7pX9fiaqjPg | 願天歡喜 Heavens Rejoice | 愛可以再更多一點點 |
| 5978 | 5OZm6ozWuQ4 | 單單愛祢 I Love You, Lord | 愛可以再更多一點點 |
| 5979 | VGLHKhUW1Tc | 我要全心讚美 My Heart Will Praise You, Lord | 愛可以再更多一點點 |
| 6001 | gvnph94fX9k | 這是聖潔之地 This is Holy Ground | 不要放棄・滿有能力 |
| 6002 | cmNVBQCURds | 煉淨我 Cleanse Me, Lord | 不要放棄・滿有能力 |
| 6003 | CuEg67TIoBs | 耶穌祢醫治 Jesus, You Heal | 不要放棄・滿有能力 |
| 6011 | Tt_CCoDiRaI | 聖潔歸於祢 Holy Are You, Lord | 不要放棄・滿有能力 |
| 6012 | If1Bpu6dbt8 | 耶和華行了大事 The Lord Has Done Great Things For Us | 不要放棄・滿有能力 |
| 6014 | FIUZGjJZmcw | 信實的神 You Are Faithful | 不要放棄・滿有能力 |
| 6022 | m1rx3I67UNc | 君王就在這裡 Worthy Is the King | 從早晨到夜晚 |
| 6024 | ZMCf0HzTUGY | 水深之處 Into Deeper Waters | 從早晨到夜晚 |
| 6025 | Sw8NwJKwVIs | 打開天窗 Open the Gates | 從早晨到夜晚 |
| 6027 | cB1IQVWfb6I | 更像祢 More Like You | 從早晨到夜晚 |
| 6034 | hQ6Uz6Uhesw | 信靠每一句應許 Trusting in Your Promises | 從早晨到夜晚 |
| 6039 | qQ2amRkJV-w | 水深之處 Into Deeper Waters | 從早晨到夜晚 |
| 6059 | MUJutssKHoA | 更像祢 More Like You | 從早晨到夜晚 |
| 6063 | PXEcI0CuRXg | 打開天窗 Open the Gates | 從早晨到夜晚 |
| 6071 | uRmDdvNJ4hc | 我渴望看見 We Long to See You | 從早晨到夜晚 |
| 6072 | fdM3T-a5OvM | 君王就在這裡 Worthy Is the King | 從早晨到夜晚 |
| 6084 | 4Q-GT1k9Kwc | 得勝有餘 We Have the Victory | 從早晨到夜晚 |
| 6087 | P70_e8xHpdM | 所有的榮耀歸於祢 All the Glory | 從早晨到夜晚 |
| 6092 | 1DPEywLuaTU | 信靠每一句應許 Trusting in Your Promises | 從早晨到夜晚 |
| 6097 | CigLPfxQ7Sc | 我們呼求 We Cry Out | 永遠尊貴 |
| 6098 | abqlZkDiTbI | 再一次 Once Again | 永遠尊貴 |
| 6111 | g7tdBFiHtfc | 我敬拜祢 I Worship You | 永遠尊貴 |
| 6113 | jNeVf7UD68U | 我獻上感謝 Thank You, Jesus | 永遠尊貴 |
| 6115 | dD3-QDAOnMg | 生命活水充滿我 Living Water | 永遠尊貴 |
| 6117 | Xpf9IX9mXPM | 我要歡唱 Lord, I Will Sing | 永遠尊貴 |
| 6118 | -ZnOCvRnwaQ | 永遠尊貴 All Honor To You | 永遠尊貴 |
| 6119 | jVKO6GGthWQ | 祢是何等榮美 Jesus, My Everything | 永遠尊貴 |
| 6124 | HxxPSIOkTOY | 這是耶和華所定日子 This Is the Day | 我要看見 |
| 6126 | LESo18TfBPQ | 前來敬拜 Come to Worship | 新的事將要成就 |
| 6183 | mHSSuQA3LQo | 新的異象，新的方向 Give Us Vision | 新的事將要成就 |
| 6184 | 3tNKXsR-H_E | 奔跑不放棄 Won't Give Up | 新的事將要成就 |
| 6185 | FAmBStYXv6I | 全新的生命 A New Beginning | 新的事將要成就 |
| 6186 | t9AVyCkcD3A | 我們愛戴的王 Our Beloved King | 新的事將要成就 |
| 6187 | 4VVqefWAUrY | 新的異象，新的方向 Give Us Vision | 新的事將要成就 |
| 6188 | E-n8wkQ_1Xc | 醫治我 Heal Me, Lord | 新的事將要成就 |
| 6190 | Za9UdGa-P6g | 安靜 Be Still | 新的事將要成就 |
| 6193 | nOG3gLLoVMw | 翻轉地球 Change the World | 沙漠中的讚美 |
| 6194 | AiIJR6QD42M | 祢的最愛 Your Beloved | 沙漠中的讚美 |
| 6195 | KE8X-sG64nk | 阿爸天父 Abba Father | 沙漠中的讚美 |
| 6196 | ArI6n3NH-qs | 沙漠中的讚美 Praise in the Desert | 沙漠中的讚美 |
| 6197 | HYj0YYFzgLY | 我要歌唱 I Will Sing | 沙漠中的讚美 |
| 6198 | -KdJMCUafxA | 我的天堂 My Heaven | 沙漠中的讚美 |
| 6200 | SfHh_NOZtmY | 掌上明珠 Precious Pearl | 沙漠中的讚美 |
| 6201 | OI93he8cv4U | 世界之光 Light of the World | 沙漠中的讚美 |
| 6202 | 9vkWTRP-x_c | 耶穌基督是主 Jesus Christ Is the Lord | 沙漠中的讚美 |
| 6204 | aC8cit9xERY | 耶和華靠近傷心的人 The Lord Is Close to the Broken | 沙漠中的讚美 |
| 6209 | Vov9BiKB9Zw | 這是耶和華所定日子 This Is the Day | 我要看見 |
| 6212 | IBeDhW5uET0 | 每一天我需要祢 I Need You | 我要看見 |
| 6215 | WedXepD_pY8 | 近前來 Come Close | 我要看見 |
| 6224 | 0sk6Kk3G0QA | 獻上尊榮 All the Honor | 我要看見 |
| 6225 | 1l4Gbg5aDao | 讓我得見祢的榮面 See You Face to Face | 我要看見 |
| 6226 | 08YrvyT5HHs | 更深之處 Take Me Deeper | 我要看見 |
| 6227 | azxcXb-7TfA | 在至高之處 In the Highest | 我要看見 |
| 6242 | 9ER76arAAWo | 在祢殿中 In Your Sanctuary | 我要看見 |
| 6243 | hSYtcWLUcI8 | 為愛而生 Born to Love | 我要看見 |
| 6244 | fJ3xrwudlCc | 獻上尊榮 All the Honor | 我要看見 |
| 6245 | cpTM95V7HNE | 祢必成就美好事 You Will Always Do Great Things | 我要看見 |
| 6246 | qzAi1ITmooQ | 在至高之處 In the Highest | 我要看見 |
| 6248 | wMqG6ptr6uI | 近前來 Come Close | 我要看見 |
| 6249 | 9-SC8k-mvhM | 更深之處 Take Me Deeper | 我要看見 |
| 6252 | aCrjhEkNcpc | 每一天我需要祢 I Need You | 我要看見 |
| 6253 | jvI7dY6Mz-0 | 讓我得見祢的榮面 See You Face to Face | 我要看見 |
| 6294 | 9vwNwKicN98 | 三百六十五天 365 Days | 新的事將要成就 |
| 6302 | JsGah6O48ec | 找一個地方 I Want to Go to a Place | 新的事將要成就 |
| 6304 | fo8fIMZYZyw | 傾倒 Pour Out | 新的事將要成就 |
| 6317 | 4j8AZAwBiXo | 祢的器皿 Your Salt and Light | 新的事將要成就 |
| 6318 | 5QmE9psO71g | 願祢國度降臨 When Your Kingdom Comes | 新的事將要成就 |
| 6319 | hvZUyRbBudo | 給夢想一雙翅膀 Let the Dreams Fly | 新的事將要成就 |
| 6320 | fpOboLMrCDE | 前來敬拜 Come to Worship | 新的事將要成就 |
| 6321 | ZNl6CHWHsaE | 找一個地方 I Want to Go to a Place | 新的事將要成就 |
| 6322 | AW6aFoCCaIg | 能不能 Let Me Stay | 新的事將要成就 |
| 6323 | O8Rb-3oQDfM | 全新的生命 A New Beginning | 新的事將要成就 |
| 6327 | -KHFjWkfXAQ | 我們愛戴的王 Our Beloved King | 新的事將要成就 |
| 6328 | jIg4jptBArY | 安靜 Be Still | 新的事將要成就 |
| 6330 | EX742-NmARg | 醫治我 Heal Me, Lord | 新的事將要成就 |
| 6332 | OFJT8hCvqiw | 新的異象，新的方向 Give Us Vision | 新的事將要成就 |
| 6398 | Zx1AMuYdykw | 順服 I Surrender My All | 這裡有榮耀 |
| 6406 | FTeiWLE3TRI | 我心唯一愛慕 You Are the One I Want | 這裡有榮耀 |
| 6407 | za0aGWW7kTU | 耶和華大能的軍隊 Army of the Living God | 這裡有榮耀 |
| 6408 | ToCWOT18ELU | 謝謝祢 Thank You Lord | 這裡有榮耀 |
| 6410 | WA8MqGNWRTQ | 主祢的疼 Lord, It's Your Love | 這裡有榮耀 |
| 6411 | 0bUQQBx4n3w | 以馬內利 Emmanuel | 這裡有榮耀 |
| 6412 | u4_BDnIWAhs | 永恆唯一的盼望 The Hope of Our Lives | 這裡有榮耀 |
| 6413 | _1qAkP0M87I | 愛中相遇 See You Face to Face | 這裡有榮耀 |
| 6415 | poD9Qz5W1qE | 從這代到那代 From Now till Evermore | 這裡有榮耀 |
| 6416 | QwNYhuoEADc | 更多充滿 Come Overflow | 這裡有榮耀 |
| 6442 | RCMQ6S7QoCI | 帶我進入祢的同在 Take Me into Your Holy Place | 從心合一 |
| 6452 | ZJWZQyLzDRQ | 從心合一 Unity | 從心合一 |
| 6453 | FbpeAZTLwzo | 耶和華作了我的高臺 You're My Fortress | 從心合一 |
| 6456 | jHpqPOc9TCA | 是祢的愛 It's Your Love | 從心合一 |
| 6457 | fOOeufJyFXw | 禱告的大軍 A Praying Army | 從心合一 |
| 6458 | a1kgmTurEJo | 深刻的愛 Jesus, Your Love | 從心合一 |
| 6459 | C5LthpoS0ck | 願祢降臨 Let Your Glory Fall | 從心合一 |
| 6460 | B09ZuXe8Iok | 永遠不分離 Never Be Apart | 從心合一 |
| 6488 | gmqXgffoVrI | 我要順服 I Will Obey | 將天敞開．活著為要敬拜祢 |
| 6489 | fZV8lYNjWCw | 同心高舉十架 Lift Up the Cross | 將天敞開．活著為要敬拜祢 |
| 6490 | dfVQ2nbrPnM | 十架的愛 Great Is Your Love | 將天敞開．活著為要敬拜祢 |
| 6491 | _HbJH_x-OaE | 自由地歌唱 Freely Sing Your Praise | 將天敞開．活著為要敬拜祢 |
| 6493 | WxrAYIaLQOk | 救贖的恩典 The Grace of Redemption | 將天敞開．活著為要敬拜祢 |
| 6494 | Q7AQV-6q3ek | 讓愛飛翔 Let Your Love Rise | 相信有愛就有奇蹟 |
| 6495 | LWmpbK4TcIo | 藏不住 Cannot Hide | 相信有愛就有奇蹟 |
| 6496 | EO_6yNTbKGY | 上帝的愛真奇妙 How Amazing Is His Love | 相信有愛就有奇蹟 |
| 6497 | 8xGdaxTpAYA | 就是這個時刻 Now is the Time | 將天敞開．活著為要敬拜祢 |
| 6498 | 6n-XYA442MY | 尋見 Found in You | 相信有愛就有奇蹟 |
| 6499 | 57AbvGHEnCk | 為耶路撒冷祈禱 Pray for Jerusalem | 將天敞開．活著為要敬拜祢 |
| 6500 | xUMrVKjQrTI | 認定祢 I Will Trust in You | 愛可以再更多一點點 |
| 6501 | shCA1uIfKPY | 在耶穌的腳前 At Your Feet | 相信有愛就有奇蹟 |
| 6502 | sW4TX5yMxjk | 與祢同行 Walk with You | 愛可以再更多一點點 |
| 6504 | mSrFg0qrLWY | 得釋放 You Have Set Me Free | 愛可以再更多一點點 |
| 6505 | mR2TSYlv5Ow | 耶和華恩年已來到 The Year of Jubilee | 相信有愛就有奇蹟 |
| 6506 | QVLUGWybeco | 最好的朋友 My Savior and My Friend | 愛可以再更多一點點 |
| 6507 | IKGazOdWmH4 | 住在祢裡面 Abiding in You | 相信有愛就有奇蹟 |
| 6508 | HuV34QymGQE | 天使心 Angel's Heart | 相信有愛就有奇蹟 |
| 6511 | Y-cpcDSf_z4 | 一同起舞 We'll Dance | 將天敞開．活著為要敬拜祢 |
| 6512 | PO0-QmW54kI | 新耶路撒冷 New Jerusalem | 將天敞開．活著為要敬拜祢 |
| 6513 | z_HqOFsr210 | 活著為要敬拜祢 I Live to Worship You | 將天敞開．活著為要敬拜祢 |
| 6514 | _CoGIo0-mTM | 配得頌揚 Worthy of Praise | 將天敞開．活著為要敬拜祢 |
| 6526 | ED3-h7Cc_4s | 八福 [Beatitudes] | 相信有愛就有奇蹟 |
| 6536 | l1rHyDtS7eE | 生命的話語 | 最珍貴的角落 |
| 6543 | BPwc-voAEpA | 耶和華我的磐石 | 不要放棄・滿有能力 |

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | 撞中嘅專輯 |
|---|---|---|---|
| 33 | b3oivk4W7EY | 有一位神 | 讓讚美飛揚 / 有一位神 |
| 38 | kYHmfN8tXPM | 我要看見 | 我要看見 / 一閃一閃亮晶晶 |
| 40 | V7MIkQD7fvg | 這裡有榮耀 | 這裡有榮耀 / 讚美的孩子最喜樂 |
| 41 | kp0nbIAnhn0 | 我們歡迎君王降臨 | 這裡有榮耀 / 彩虹 |
| 42 | PG_J_0gsMXA | 榮耀大君王 | 新的事將要成就 / High to the Sky |
| 45 | OVUPLFLdmpE | 將天敞開 | 將天敞開．活著為要敬拜祢 / 把冷漠變成愛 |
| 66 | 61e4JlANH2Q | 雲上太陽 | 全能的創造主 / 小小的夢想 |
| 171 | trgS6ACbTig | 我的生命獻給祢 (粵語版 - 官方譯本) | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 172 | 2vCYXbbq8mw | 我們的神 (粵語版 - 官方允准譯本) | 讚美中信心不斷升起 / 盡情地微笑 |
| 214 | QOJ2WCZY1xc | 在祢沒有難成的事 Nothing Is Impossible | 讚美中信心不斷升起 / 盡情地微笑 |
| 4171 | tQ8416-jL9I | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4172 | jcGEFyU1ng8 | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4230 | nhe98jfgC2g | Stay [停留] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4231 | Tb8NenNEjkU | Mighty [祢愛有能力] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4235 | QmBxI-KK-vc | Stay [停留] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4236 | O4UTnns3fT0 | Mighty [祢愛有能力] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4249 | qAahIVJAcyg | 大聲敬拜 Shout Out Your Praise | 我能給你什麼 / 耶穌是我最好的朋友 |
| 4255 | 4FOrsKzHJ_I | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4258 | vbkeGAokfxQ | 大聲敬拜 Shout Out Your Praise | 我能給你什麼 / 耶穌是我最好的朋友 |
| 4263 | rfaj5UUN8o8 | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4266 | cOdOdmjtSlg | 是耶穌的名 We Lift Up Your Name (It's Jesus) | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4269 | GUi6uy8uOKM | 我的生命獻給祢 I Will Offer You My Life | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 4270 | jemA0jIrp5M | 和散那 Hosanna | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4288 | BKJ3nJLwNvg | 在祢沒有難成的事 Nothing Is Impossible | 讚美中信心不斷升起 / 盡情地微笑 |
| 4291 | nqXv_-hjols | 榮耀榮耀榮耀 Glory, Glory, Glory | 讚美中信心不斷升起 / 盡情地微笑 |
| 4292 | k_rDziurd9M | 我們的神 You Are Our God | 讚美中信心不斷升起 / 盡情地微笑 |
| 4914 | l-QB8A5vJbM | 大聲敬拜 Shout Out Your Praise | 我能給你什麼 / 耶穌是我最好的朋友 |
| 4915 | MN13hDmHs54 | 大聲敬拜 Shout Out Your Praise | 我能給你什麼 / 耶穌是我最好的朋友 |
| 4924 | v2jhUrdN-dU | 展開清晨的翅膀 Wings of the Dawn | 展開清晨的翅膀 / 只願見祢 |
| 4951 | f6rW1Um5IOQ | 是耶穌的名 We Lift Up Your Name (It's Jesus) | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4952 | jQgKhdipEQQ | 是耶穌的名 We Lift Up Your Name (It's Jesus) | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4959 | IGnfJWVKJow | 和散那 Hosanna | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4960 | hyjcNF1dxzM | 和散那 Hosanna | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4989 | GS0FZHX8BFU | 我相信 [閩南語] I Believe | 似乎在天堂 / 寶貴十架 |
| 4990 | 4g746j4s7Rs | 彩虹下的約定 The Covenant Under the Rainbow | 彩虹下的約定 / 只願見祢 |
| 5032 | fNTutnHAc34 | 榮耀榮耀榮耀 Glory, Glory, Glory | 讚美中信心不斷升起 / 盡情地微笑 |
| 5033 | lSbdu2Bq5Gc | 榮耀榮耀榮耀 Glory, Glory, Glory | 讚美中信心不斷升起 / 盡情地微笑 |
| 5056 | kvrRtRe9AoU | 我們的神 You Are Our God | 讚美中信心不斷升起 / 盡情地微笑 |
| 5057 | 3QSUYtAcJjk | 在祢沒有難成的事 Nothing Is Impossible | 讚美中信心不斷升起 / 盡情地微笑 |
| 5064 | nzsMY2_td4Y | 我們的神 You Are Our God | 讚美中信心不斷升起 / 盡情地微笑 |
| 5102 | mZtw8-OBbuQ | 耶和華作王 Our God Reigns | 聽見這世代的呼喚 / 盡情地微笑 |
| 5105 | l8QtshEeAmk | 我的生命獻給祢 I Will Offer You My Life | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 5114 | 3O9mPEWNgDk | 不動搖的信心 Unshakeable Faith | 聽見這世代的呼喚 / 盡情地微笑 |
| 5137 | YrcWk_8LXlg | 耶和華作王 Our God Reigns | 聽見這世代的呼喚 / 盡情地微笑 |
| 5138 | x5elrTM-t6k | 我的生命獻給祢 I Will Offer You My Life | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 5139 | XUZN4RUpSOk | 盡情地微笑 Smile | 聽見這世代的呼喚 / 盡情地微笑 |
| 5140 | H9OdfU5I9yQ | 不動搖的信心 Unshakeable Faith | 聽見這世代的呼喚 / 盡情地微笑 |
| 5150 | yYlFWW4nhbU | 新的事將要成就 You Do a New Thing [Remix] | 新的事將要成就 / 彩虹 |
| 5153 | YaJ5gof0YNQ | 恩典之路 The Path of Grace | 不要放棄・滿有能力 / 新造的人 |
| 5162 | m5dvHpq5Fg4 | 歌頌 Sing and Praise | 不要放棄・滿有能力 / 新造的人 |
| 5163 | ToAiGNAC0m4 | 祢的愛長闊高深 Your Love Is Deep and Wide | 不要放棄・滿有能力 / 新造的人 |
| 5235 | tCKvXnD4XeY | 認識祢真好 It's Good To Know You | 耶和華祝福滿滿 / 認識祢真好 |
| 5238 | fE0pVMc5kQQ | 全然向祢 All For You | 讓讚美飛揚 / 只願見祢 |
| 5247 | d0WWNpHQe54 | 耶和華祝福滿滿 Jehovah's Blessings Abound | 耶和華祝福滿滿 / 祢是信實的上帝 |
| 5248 | cyo4B6MsK3g | 彩虹下的約定 The Covenant Under the Rainbow | 彩虹下的約定 / 只願見祢 |
| 5259 | sGF7twYuuxM | 彩虹下的約定 The Covenant Under the Rainbow [Pop版] | 彩虹下的約定 / 只願見祢 |
| 5271 | wFfQFp5HhgQ | 光明之子 Children of Light | 讓讚美飛揚 / G.L.O.W. 差遣我 |
| 5272 | jKrWdZsVQU0 | 愛，我願意 I Receive Your Love | 彩虹下的約定 / 讚美的孩子最喜樂 |
| 5283 | YvETeAd6ctE | 除祢以外 Whom Have I But You | 耶和華祝福滿滿 / 只願見祢 |
| 5294 | ZxFEsYcWgk8 | 平安的七月夜 Peaceful July | 甦醒 / 祢是信實的上帝 |
| 5295 | Wmb_HtayZV4 | 注目看耶穌 Look Upon Jesus | 甦醒 / 把冷漠變成愛 |
| 5296 | U_D3qRW-M9A | 我對祢的愛永不變 My Love for You Will Never Change | 彩虹下的約定 / 彩虹 |
| 5323 | affOVkHjWpA | 我們是光明之子 We Are the Children of Light | 讓讚美飛揚 / 有一位神 |
| 5333 | 4nO8vnxWthI | 馨香晚祭 The Evening Sacrifice | 彩虹下的約定 / 只願見祢 |
| 5345 | 1UO9srprYJc | 我是天父的孩子 I Am A Child Of God | 我在這裡 / 放晴了 |
| 5346 | a2F71ozfUNY | 我是天父的孩子 I Am A Child Of God | 我在這裡 / 放晴了 |
| 5381 | gmDZjQ8JOyU | 我們高舉耶穌的名 Lift Up The Name Of Our King | 我在這裡 / 放晴了 |
| 5382 | ri--and1V8M | 我們高舉耶穌的名 Lift Up The Name Of Our King | 我在這裡 / 放晴了 |
| 5383 | qeWrBRGK_Lg | 當祢走進我們當中 When Your Presence Comes Upon Us | 我在這裡 / 放晴了 |
| 5390 | pk-lzqmiofM | 當祢走進我們當中 When Your Presence Comes Upon Us | 我在這裡 / 放晴了 |
| 5393 | yW323r5pMHs | 把冷漠變成愛 Fill Our Heart With Love | 全新的你 / 把冷漠變成愛 |
| 5405 | OSjjpGHiozM | 耶穌愛你 Jesus Loves You | 全新的你 / 認識祢真好 |
| 5429 | JqTjvgmZHRo | 專心仰望耶穌 Focus on Jesus | 全能的創造主 / 把冷漠變成愛 |
| 5443 | xugw9VE0pjc | 展開清晨的翅膀 Wings of the Dawn | 展開清晨的翅膀 / 只願見祢 |
| 5452 | VG8nE8Ttyrk | 耶穌，我的耶穌 Jesus, My Jesus | 展開清晨的翅膀 / 把冷漠變成愛 |
| 5453 | homljdAOovs | 彈琴歌唱讚美祢 Praise Him | 展開清晨的翅膀 / 有一位神 |
| 5465 | IHuoUm3ihcI | 如果你想知道 If You Want To Know (Where Love is) | 展開清晨的翅膀 / 有一位神 |
| 5466 | AcKMRfsYERY | 展開清晨的翅膀 Wings of the Dawn [Pop版] | 展開清晨的翅膀 / 只願見祢 |
| 5512 | Wi4YiY_Hfcc | 主的恩典乃是一生之久 The Light of Your Grace | 讓愛走動 / 只願見祢 |
| 5522 | glIEsTt2A84 | 讓愛走動 Love Overflows | 讓愛走動 / 把冷漠變成愛 |
| 5537 | 4-uLKCcufRU | 進入豐盛 Into His Abundance | 深觸我心 / 有一位神 |
| 5539 | KLdSuKezMgs | 凡事都能做 All Things are Possible | 深觸我心 / 無止境 |
| 5547 | xZ3-_Tx0Kfg | 求主充滿我 Come and Fill Me Up | 深觸我心 / 有一位神 |
| 5551 | MEHMGqHh9ZY | 主的喜樂是我力量 The Joy of the Lord is My Strength | 深觸我心 / 小小的夢想 |
| 5558 | fgHBHUPiaJI | 一生愛祢 With All My Love | 深觸我心 / 只願見祢 |
| 5560 | AvECAFFJVik | 我的救贖者活著 My Redeemer Lives | 深觸我心 / 只願見祢 |
| 5561 | zb_ykrrL4Ow | 看見復興 Until We See You | 深觸我心 / 認識祢真好 |
| 5575 | tvAe-5WfvYg | 祢的同在 Your Presence | 單單只為你 / 有一位神 |
| 5587 | xtUZ-f9M-HE | 親近祢 Close To You | 單單只為你 / 只願見祢 |
| 5598 | Pvt6OLIaM30 | 耶和華是我牧者 Lord, You Are My Shepherd | 單單只為你 / 認識祢真好 |
| 5609 | 80uNFuY_aL4 | 全然美麗 Beautiful | 似乎在天堂 / 無止境 |
| 5611 | en_VC0q3O8o | 我相信 I Believe | 似乎在天堂 / 寶貴十架 |
| 5621 | UJgHrXiSQfQ | 祢恩典不離開 Your Grace | 似乎在天堂 / 只願見祢 |
| 5632 | CtEmco5_7Ys | 祢的慈愛 Unfailing Love | 似乎在天堂 / 有一位神 / 只願見祢 |
| 5633 | CPryH5-Ud7s | 祢是我的一切 You Are Everything To Me | 似乎在天堂 / 只願見祢 |
| 5655 | FDzO1GOWdoc | 我的聲音帶有能力 My Voice Has Power - SOP NEXT | 從早晨到夜晚 / High to the Sky |
| 5656 | 6UcZ3KEkzY0 | 最深愛的主 The Love of My Life - SOP NEXT | 小小的夢想 / G.L.O.W. 差遣我 |
| 5750 | F_sbLMN6g2I | 來歡呼來讚美 Let Us Shout | I Believe / 放晴了 |
| 5756 | QOsfDTYQosk | 十字架 The Cross | I Believe / 放晴了 |
| 5764 | j69OWSfUlhM | I Believe [我相信] | I Believe / 無止境 |
| 5767 | CNL-CyDEpPo | 十字架 The Cross | I Believe / 放晴了 |
| 5768 | i_z3k1g9taU | 大山為我挪開 Mountains Move for Me | I Believe / 無止境 |
| 5775 | _xJkYVZ50p0 | 大山為我挪開 Mountains Move for Me | I Believe / 無止境 |
| 5777 | nTYUAqq-72g | I Believe [我相信] | I Believe / 無止境 |
| 5824 | v5wnpajW6jo | 榮耀的呼召 Glorious Calling | 新的事將要成就 / 彩虹 |
| 5827 | uTGPl8f-reQ | 滿有能力 I Am Strengthened in Him | 不要放棄・滿有能力 / 小小的夢想 |
| 5834 | u2M-zzt1Whc | 何等恩典 How Could It Be | 不要放棄・滿有能力 / 讚美的孩子最喜樂 |
| 5838 | -O0jRF7CQCQ | 最美的禮物 The Most Precious Gift | 不要放棄・滿有能力 / 放晴了 |
| 5839 | MP_0qHJW-Gw | 愛可以再更多一點點 More Love | 愛可以再更多一點點 / 把冷漠變成愛 |
| 5840 | JHniREYlHcE | 耶穌的名 Jesus, Your Name | 愛可以再更多一點點 / 新造的人 |
| 5845 | byWidixIwBE | 神羔羊 Lamb of God | 愛可以再更多一點點 / High to the Sky |
| 5853 | uu44U9z-azg | 相信有愛就有奇蹟 Believe in Love, You Will See Miracles | 相信有愛就有奇蹟 / 新造的人 |
| 5860 | AzPxz-2g94U | 我有喜樂 A Joyful Song | 從心合一 / 讚美的孩子最喜樂 |
| 5861 | YLMK92nrhbw | 新的一天 A Brand New Day | 從心合一 / 彩虹 |
| 5862 | YU0aBuY_L2Q | 齊來讚美 Praise Your Holy Name | 從心合一 / 新造的人 |
| 5863 | UqhiMn-LTxk | 聖靈的江河 Holy Spirit, Come | 從心合一 / 彩虹 |
| 5868 | 3mCWiQGJtYM | 極大的聲音 Praise You With My Everything | 這裡有榮耀 / 無止境 |
| 5926 | D365p9i7T9U | 小小的夢想 Little Dream | 寶貴十架 / 小小的夢想 |
| 5934 | izOAxx2bRIc | 主祢是我力量 You Are My Strength | 寶貴十架 / 讚美的孩子最喜樂 |
| 5935 | OVgfb379eSw | 在祢寶座前 Before Your Throne | 寶貴十架 / 認識祢真好 |
| 5938 | 4gxxSK5uwts | 喔！十字架 In The Cross | 寶貴十架 / 有一位神 |
| 5946 | 0YJZUyVOQVY | 寶貴十架 Precious Cross | 寶貴十架 / 認識祢真好 |
| 5956 | Y3eE_e5rMvc | 祢是配得 (聖哉聖哉全地唱) You Are Worthy | 永遠尊貴 / 相信有愛就有奇蹟 |
| 5966 | u1oZG23ub7E | 耶穌的名 Jesus, Your Name | 愛可以再更多一點點 / 新造的人 |
| 5967 | mm4c1bojIi0 | 神羔羊 Lamb of God | 愛可以再更多一點點 / High to the Sky |
| 6000 | tzf7VCIpnsw | 在這裡 You Are Here | 從早晨到夜晚 / High to the Sky |
| 6010 | xfy_ciLKnlo | 滿有能力 I Am Strengthened In Him | 不要放棄・滿有能力 / 小小的夢想 |
| 6013 | PedRwSvcWRI | 何等恩典 How Could It Be | 不要放棄・滿有能力 / 讚美的孩子最喜樂 |
| 6023 | kpIFVSlC9qI | 我的聲音帶有能力 My Voice Has Power | 從早晨到夜晚 / High to the Sky |
| 6026 | lo-eFsNtW4I | 喜樂河流 River of Joy | 從早晨到夜晚 / 一閃一閃亮晶晶 |
| 6035 | ZzjucjDQQDY | 圍繞我 You Surround Me | 從早晨到夜晚 / 放晴了 |
| 6036 | 7mrMh_2tXCI | 美好的創造 Beautifully Made | 從早晨到夜晚 / 無止境 |
| 6049 | 6astoRRUU5I | 美好的創造 Beautifully Made | 從早晨到夜晚 / 無止境 |
| 6061 | nJBLeMrhu9w | 在這裡 You Are Here | 從早晨到夜晚 / High to the Sky |
| 6075 | cXCSVBN9nS8 | 圍繞我 You Surround Me | 從早晨到夜晚 / 放晴了 |
| 6094 | egRnTHQiZW0 | 喜樂河流 River of Joy | 從早晨到夜晚 / 一閃一閃亮晶晶 |
| 6099 | usHsWo5sY0U | 耶穌我愛祢 Jesus I Love You | 永遠尊貴 / 認識祢真好 |
| 6114 | -wxmIAkXioc | 震動天地 Shake the Heaven and Earth | 永遠尊貴 / 讚美的孩子最喜樂 |
| 6116 | N7ggr892lEk | 祢是配得 You Are Worthy | 永遠尊貴 / 相信有愛就有奇蹟 |
| 6123 | kszbPoctPbo | 新的事將要成就 You Do a New Thing | 新的事將要成就 / 彩虹 |
| 6191 | 8Y6e0xJlROI | 只要有祢在我左右 If My God Is With Me | 新的事將要成就 / 彩虹 |
| 6199 | vjrMTpacP7w | 賜福與你 Blessings of God Be Upon You | 沙漠中的讚美 / 認識祢真好 |
| 6205 | fUijjKO3lYU | 我們愛 (讓世界不一樣) We Will Love (We Can Make a Difference) | 沙漠中的讚美 / 認識祢真好 |
| 6214 | XYTtbthM4KI | 行神蹟的神 God of Miracles | 我要看見 / High to the Sky |
| 6216 | 6wc9xUOO0HU | 這世代要呼求祢 Here We Stand | 我要看見 / 無止境 |
| 6223 | 1VOBEx3m7Ro | 我要看見 I Want to See | 我要看見 / 一閃一閃亮晶晶 |
| 6247 | lZ-s10eaSug | 這世代要呼求祢 Here We Stand | 我要看見 / 無止境 |
| 6251 | b01SqJBHEjM | 行神蹟的神 God of Miracles | 我要看見 / High to the Sky |
| 6301 | hNO5l4mjDHc | 敬拜讓世界震動 With Our Praises Shake the World | 新的事將要成就 / 一閃一閃亮晶晶 |
| 6303 | WQtpV632qyY | 榮耀大君王 Glory to You | 新的事將要成就 / High to the Sky |
| 6326 | XpmU73jYhrE | 只要有祢在我左右 If My God Is with Me | 新的事將要成就 / 彩虹 |
| 6331 | HUBC6SN5BXw | 新的事將要成就 You Do a New Thing | 新的事將要成就 / 彩虹 |
| 6419 | ADg-yNGjPVA | 極大的聲音 Praise You with My Everything | 這裡有榮耀 / 無止境 |
| 6420 | a5X4uawExEA | 我們歡迎君王降臨 We Long to Meet | 這裡有榮耀 / 彩虹 |
| 6421 | 61tcxSdsVjw | 這裡有榮耀 Glory | 這裡有榮耀 / 讚美的孩子最喜樂 |
| 6446 | Kt8wU0COPTI | 齊來讚美 Praise Your Holy Name | 從心合一 / 新造的人 |
| 6448 | pLl0rSQ4oR4 | 聖靈的江河 Holy Spirit Come | 從心合一 / 彩虹 |
| 6449 | PrO_sNIJKU4 | 我有喜樂 A Joyful Song | 從心合一 / 讚美的孩子最喜樂 |
| 6454 | te2M8oWej80 | 回家 Coming Home | 從心合一 / 新造的人 |
| 6455 | mPcKQnEQKuQ | 天上的家 My Heavenly Home | 從心合一 / 無止境 |
| 6492 | XvND3uisjho | 我已得自由 I Have Been Set Free | 將天敞開．活著為要敬拜祢 / 讚美的孩子最喜樂 |
| 6503 | mlSygmrZnok | 耶和華沙龍 Jehovah Shalom | 愛可以再更多一點點 / 新造的人 |
| 6509 | 3zIYhQAs1z8 | 我的家要榮耀主 My House Will Praise You | 愛可以再更多一點點 / 讚美的孩子最喜樂 |
| 6515 | TaHTuEZmQ60 | 日日夜夜 Day and Night | 將天敞開．活著為要敬拜祢 / 無止境 |
| 6527 | e_efJu4ds2k | 相信有愛就有奇蹟 Believe in Love, You Will See Miracles | 相信有愛就有奇蹟 / 新造的人 |
| 6538 | vAGcc8XE4d0 | 我們愛 | 沙漠中的讚美 / 認識祢真好 |
| 6539 | u2k_zSg2d-Q | 滿有能力 | 不要放棄・滿有能力 / 小小的夢想 |
| 6540 | dgaMBDJSe5A | 何等恩典 | 不要放棄・滿有能力 / 讚美的孩子最喜樂 |
| 6541 | Do7NwFKVpgw | 寶貴十架 | 寶貴十架 / 認識祢真好 |
| 6542 | wh6WwSrlkhw | 恩典之路 | 不要放棄・滿有能力 / 新造的人 |

(catalog 搵唔到嘅 748 首、DB 已有 album 冇覆寫嘅 11 首,唔逐條列,見上面統計數字。)
