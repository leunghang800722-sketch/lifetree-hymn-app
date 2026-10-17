# K-C 對數報告 —— 兒童詩歌 staging 重攞(TAXONOMY-5D-PLAN §3.4.3)

> **2026-08-02 Eric 已首肯 `K-C-triage.md` §1-§4 全部四項(跟 Fable 5 建議),
> 本版係執行後定案版**——已行:①staging 剔走 58 條非歌內容(§1a/§1b/§1c)
> ②救返 36 條 + Piano Lullaby 13 條(§2a/§2b,Eric 收,performer='純音樂'
> performer_source='manual')③兩條 lang-suspect 定案國語、清 flag(§3)。
> 詳細數字見 `finalizeKidsC4.js --triage` 輸出 + `c4-triage-summary.json`。
>
> ⚠️ 執行時發現一個文件內部數字對唔上,唔擋行、記喺度:`K-C-triage.md` §1a
> 標題寫「38 條」,但實際逐條列出嘅 youtube_id 有 45 條(45+6+7=58,唔係
> 文件自己算嘅 51)。45 條逐條查證 kids_refetch 現存 title,全部撞得中
> §1a 自己描述嘅「清談/推廣/preview/教材」類別,冇一條似漏網嘅正牌歌——
> 當係文件標題數得錯,用返完整 id 清單(可操作嘅資料)做準。
>
> 下面「⚠️ 走漏清單」而家淨返 33 首(對比行 triage 之前嘅 76 首):Eric 揀
> 唔救嘅 §2c「由佢流失」類別(合輯/長片/促銷/故仔片)+ 幾條 Yancy「shares
> about」promo 片本身連候選都未行到(outcome=candidate,呢個係 refetchKids.js
> 原有 REASON_LABELS 冇覆蓋嘅顯示字眼,唔係新增問題)——全部屬於 Eric 已經
> 拍板「唔使救」嘅類別,**呢份唔使再簽,可以直接行 K-D**。
>
> ⚠️ **走漏清單要 Eric 過目簽名先可以行 C4(原子對換)**。呢份報告可以隨住
> `refetchKids.js` 分幾轆跑(`--group` / 斷點續跑)重新生成,每次都係最新狀態。

生成時間:2026-08-01 16:29:14
舊庫(lang='兒童',唔計 148 首 rejected 墓碑):471 首
staging(kids_refetch)現有:608 首
✅ 重攞返:438 首  ➕ 新收:170 首  ⚠️ 走漏:33 首

## Lang 分佈 vs §3.4.2 預期

| 語言 | staging 首數 |
|---|---|
| 國語 | 134 |
| 粵語 | 163 |
| 英文 | 311 |

各團體預期 kidsLang(§3.4.2):讚美之泉兒童=國語、ACM兒童詩歌=粵語、Hillsong Kids=英文、Listener Kids=英文、CJ and Friends=英文、Yancy=英文、基恩敬拜祈禱仔=粵語、Giggles and Tunes=粵語

## ⚠️ 走漏清單(33 首)—— 要 Eric 過目

| id | 團體 | 標題 | 原因 |
|---|---|---|---|
| 1525 | Listener Kids | Patriotic Songs For Kids. Celebrate America's 250th Birthday. God Bless America, Yankee Doodle +more | 片長唔喺 75-600s 帶 |
| 1553 | Listener Kids | Christian videos for Kids / This Little Light of Mine + more bible stories | 片長唔喺 75-600s 帶 |
| 1555 | Listener Kids | Ten Little Angels / Counting Song / + More Bible Songs | 片長唔喺 75-600s 帶 |
| 1602 | Listener Kids | Jingle Bells (with sing-along lyrics) plus more Christmas songs for kids | 片長唔喺 75-600s 帶 |
| 1631 | Listener Kids | God Made Me (with lyrics) +35 minutes of praise and worship for kids | 片長唔喺 75-600s 帶 |
| 1651 | Listener Kids | Little David Play On Your Harp (with lyrics) - David and Goliath, plus more Bible songs for kids | 片長唔喺 75-600s 帶 |
| 1652 | Listener Kids | Vol. 7 "Jesus Love the Little Children" by Listener Kids - 8 Bible songs for preschoolers | 片長唔喺 75-600s 帶 |
| 1658 | Hillsong Kids | Kidsongalong - From Kidsong 25 | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 1669 | Listener Kids | Jesus Loves the Little Children (with lyrics) + Jesus Loves Me + 1 hr of Bible Songs | 片長唔喺 75-600s 帶 |
| 1689 | Listener Kids | Action BIBLE Songs for Kids - Jett the Robot - Dance and Worship Fun! | 片長唔喺 75-600s 帶 |
| 1705 | Listener Kids | Jack & Scarlett "He's Got the Whole World in His Hands" - Christian Story for Kids | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 1723 | Listener Kids | Songs with Motions by listener kids - 15 mins of kids praise | 片長唔喺 75-600s 帶 |
| 1813 | Hillsong Kids | Piano Lullabies (Full Album) / Hillsong Kids (1 Hour Peaceful Worship) | 片長唔喺 75-600s 帶 |
| 1846 | Yancy | 6 7 loop from Yancy & Little Praise Party's "My God Is Number One" FUN  kids viral slang Christian | 片長唔喺 75-600s 帶 |
| 1871 | Yancy | Cotton Candy and Colorful Tie Dye Merch is here for all plus Yancy tells you how to save 20% #yancy | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 1872 | Yancy | HEARTBEAT Curriculum Features and Included Media (Teach the heart of worship) | candidate |
| 1873 | Yancy | Stained Glass Kids Podcast with Yancy - Conversations with PK's and ministry kids to bring light | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 1891 | CJ and Friends | Wheels on the Bus 🚌🎶 (CJ’s Praise Version) / Sing Along with Motions & Lyrics / CJ and Friends | candidate |
| 1942 | Yancy | CHORUS - Worship Leader Coaching for Next Gen Ministry with Yancy (Kids & Student Worship) | 片長唔喺 75-600s 帶 |
| 1943 | Yancy | Setting the table for my BIRTHDAY SALE! This week only 7/16-19/24  - Yancy music & merch best deal | 片長唔喺 75-600s 帶 |
| 1978 | Yancy | Valentines gift ideas from Yancy - Special  offer on Yancy merch - Support our music and ministry | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 1979 | Yancy | Perfect Volunteer / Teacher Gifts for Valentines, Easter, Christmas or any Thank You -Ripple Effect | 片長唔喺 75-600s 帶 |
| 2006 | CJ and Friends | Christmas Bible Story and Worship for Kids / Scripture Safari with CJ and Friends | 片長唔喺 75-600s 帶 |
| 2014 | Yancy | Yancy shares about Kidmin Worship Vol 8 Songs of Revival - Praise for children - kids | candidate |
| 2015 | Yancy | Yancy shares about the songs on Kidmin Worship Vol. 7 Resurrection Worship Songs for children - kids | candidate |
| 2022 | Yancy | Kidmin Worship Vol. 8 Songs of Revival SONG PREVIEW by Yancy - Preteen & Elementary Praise Videos | candidate |
| 2023 | Yancy | Kidmin Worship Vol 7 Resurrection Worship Songs PREVIEW by Yancy - Preteen & Elementary Kids Praise | candidate |
| 2024 | Yancy | Let's Get Started - 12 Video Countdowns for Kidmin PREVIEW -Perfect to kick off services & events | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 2050 | Yancy | Today is my birthday and this is big news you don’t want to miss. I have something for YOU! | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 2084 | CJ and Friends | The Butterfly Song, One Way, Who You Say I Am + More! 🎉 Kids Worship Dance-Along 🎶 CJ & Friends | 片長唔喺 75-600s 帶 |
| 2408 | Hillsong Kids | 🎉 Happy Birthday 🎈 Let's Celebrate! | 片長唔喺 75-600s 帶 |
| 2409 | Hillsong Kids | Let's Tidy Up - #cleanuptime🧹 | 標題冇撞到歌訊號(contentGate,英文團體專用) |
| 4034 | 讚美之泉兒童 | 2019 讚美之泉兒童敬拜讚美專輯 (10) - 無止境 No Bounds 宣傳短片 | 頻道搵唔到條片(可能刪咗/私影/depth 200 都摞唔到) |

## ➕ 新收(170 首,頻道有新片/上次漏)

| 團體 | 語言 | 標題 |
|---|---|---|
| Listener Kids | 英文 | Down By the Riverside  - Kids Song - Listener Kids |
| Listener Kids | 英文 | Arky Arky (Rise and Shine) - Bible Story Song for Kids |
| Listener Kids | 英文 | Jesus Loves the Little Children (All New Version) by Listener Kids / Bible song |
| Listener Kids | 英文 | He's Got the Whole World in His Hands - Praise Song for Preschool |
| Listener Kids | 英文 | Jack & Scarlett's Joyful Adventure - A Christian Story and Song for Kids - Listener Kids Storytime |
| Listener Kids | 英文 | Walking with Jesus (Listener Kids Version) - Kids Bible Song |
| Listener Kids | 英文 | Deep and Wide by Listener Kids - Sunday school song |
| Listener Kids | 英文 | This Is the Day That the Lord Has Made - Kids Praise Song |
| Listener Kids | 英文 | J-E-S-U-S by Listener Kids - animated bible song for kids |
| Listener Kids | 英文 | I'll Be a Sunbeam for Jesus / Bible Song |
| Listener Kids | 英文 | This Train is Bound For Glory (sing-along) FEAT MAC POWELL |
| Listener Kids | 英文 | Give Me Oil In My Lamp (sing-along) |
| Listener Kids | 英文 | Joshua Fought the Battle of Jericho - Bible Story Song for Kids |
| Listener Kids | 英文 | Oh Be Careful Little Eyes What You See (With Lyrics) / Bible Song / Christian Video / Listener Kids |
| Listener Kids | 英文 | Get Moving with Father Abraham (with Motions) - An Engaging Bible Song for Kids! |
| Listener Kids | 英文 | Do Lord Oh Do Lord Oh Do Remember Me  (with lyrics) |
| Listener Kids | 英文 | I've Got A River Of life  (with lyrics) |
| Listener Kids | 英文 | My God Is So Big - (with lyrics) |
| Listener Kids | 英文 | J-E-S-U-S  (with lyrics) |
| Listener Kids | 英文 | Down By The Riverside - (with lyrics) |
| Listener Kids | 英文 | Alive Alive Alive Forevermore  (with lyrics) |
| Listener Kids | 英文 | Oh When The Saints Go Marching In (with lyrics) |
| Listener Kids | 英文 | Clap Your Hands All Ye People  (with lyrics) |
| Listener Kids | 英文 | Clap Your Hands All Ye People!  / Kids Praise & Worship Bible Song |
| Listener Kids | 英文 | I've Got A River Of Life  / Kids worship |
| Listener Kids | 英文 | He's Got the Whole World in His Hands (Arky Arky Version) - Praise Song for Kids |
| Listener Kids | 英文 | Jesus Loves Me Remix / @CJandFriends Dance-A-Long with Lyrics @listenerkids |
| Listener Kids | 英文 | There Is A Star (WITH LYRICS) by Listener Kids |
| Listener Kids | 英文 | "Jesus Loves Me" With Lyrics |
| Listener Kids | 英文 | The B-I-B-L-E, Thats The Book For Me! (Kids Praise and Worship) |
| Listener Kids | 英文 | Joy To The World with Lyrics (From There is A Star) |
| Listener Kids | 英文 | Silent Night - WITH LYRICS - Christmas Song For Kids |
| Listener Kids | 英文 | What A Mighty God We Serve (Kids Praise and Worship) |
| Listener Kids | 英文 | "The Joy Joy Joy Joy Down in my heart!  (kids praise and worship) |
| CJ and Friends | 英文 | God is so Good / Kids Worship Song & Dance / CJ and Friends |
| CJ and Friends | 英文 | Arky Arky / Dance A-long with Lyrics / Kids Worship |
| CJ and Friends | 英文 | Stomp (Kirk Franklin) / Worship Motions with Freestyle / CJ & Friends |
| CJ and Friends | 英文 | Joyful (Dante Bowe) / CJ & Friends Dance-Along with Lyrics |
| CJ and Friends | 英文 | One Way (Acoustic) by CJ & Friends Worship / Sing & dance-along with motions and lyrics |
| CJ and Friends | 英文 | Every Move I Make (Acoustic) by CJ & Friends Worship / Sing & dance-along with motions and lyrics |
| CJ and Friends | 英文 | Peace Like A River (Acoustic) by CJ & Friends ft. Megan Tibbits / Worship Motions + Lyrics |
| CJ and Friends | 英文 | I Wanna Bear Fruit (The Fruit of the Spirit Song) by CJ & Friends ft. Megan Tibbits / Sing-Along |
| CJ and Friends | 英文 | Jesus Loves Me (Acoustic) / CJ & Friends ft. Megan Tibbits / Worship Motions + Lyrics |
| CJ and Friends | 英文 | Put God's Work First - Matthew 6:33 / CJ and Friends & Hillsong Kids Bible Verse Song |
| CJ and Friends | 英文 | We Serve A Mighty God ⚡️ Song & Bible Story Workout for Kids / @CJandFriends and @BoboPE |
| CJ and Friends | 英文 | Peace Like a River (Acoustic) / CJ & Friends Song Sessions |
| CJ and Friends | 英文 | I Thank God / Maverick City Music & Upperroom / CJ & Friends Worship Dance with Lyrics |
| CJ and Friends | 英文 | I Wanna Bear Fruit (the Fruit of the Spirit) 🍋 CJ and Friends / Worship Song for Kids |
| CJ and Friends | 英文 | CJ and Friends - I Wanna Bear Fruit (The Fruit of the Spirit )🍏Lyric Video |
| CJ and Friends | 英文 | Go Tell It on the Mountain ❄️CJ and Friends / Christmas Dance-A-Long with Lyrics |
| CJ and Friends | 英文 | I Have Decided / CJ and Friends Dance-A-Long / Listener Kids Music with Lyrics |
| CJ and Friends | 英文 | Praise Ye the Lord🙌/ CJ and Friends Dance-A-Long / Listener Kids Music |
| CJ and Friends | 英文 | This Little Light of Mine / CJ and Friends / Dance-Along with Lyrics |
| CJ and Friends | 英文 | Tell The World Hillsong / Dance-A-Long with Lyrics / CJ and Friends |
| CJ and Friends | 英文 | The Butterfly Song (If I Were A Butterfly) / CJ and Friends / Dance-Along with Lyrics |
| CJ and Friends | 英文 | Here I Am To Worship / Dance-Along with Lyrics / CJ and Friends ft. PJ |
| CJ and Friends | 英文 | Here I Am To Worship / Lyric Video / CJ and Friends ft. PJ |
| CJ and Friends | 英文 | Trading My Sorrows / Dance-A-Long with Lyrics / CJ and Friends Worship |
| CJ and Friends | 英文 | As the Deer Remix / Dance-along with Lyrics / CJ and Friends ft. 2TheHuman |
| CJ and Friends | 英文 | Brighter Day Kirk Franklin / CJ&Friends Dance-A-Long with Lyrics |
| CJ and Friends | 英文 | Mighty to Save / Dance-A-Long with Lyrics / CJ and Friends |
| CJ and Friends | 英文 | Happy and You Know It / CJ and Friends Dance-A-Long with @listenerkids |
| CJ and Friends | 英文 | Lord I Lift Your Name On High / Dance-A-Long with Lyrics / Kids Worship |
| CJ and Friends | 英文 | The Bible Song / Dance-Along with Lyrics / Kids Worship |
| CJ and Friends | 英文 | Shackles (Praise You) / Mary Mary / Dance-A-Long with Lyrics |
| CJ and Friends | 英文 | Open the Eyes of My Heart /@CJandFriends Dance-A-Long w/Lyrics /@LocalSound Remix |
| CJ and Friends | 英文 | One Way Hillsong / Dance-A-Long with Lyrics / Animated Worship Song |
| CJ and Friends | 英文 | “This is Amazing Grace” Phil Wickham Feat. Lecrae / Dance-A-Long with Lyrics |
| CJ and Friends | 英文 | Love Theory - Kirk Franklin / Hip-Hop Dance / Praise & Worship |
| CJ and Friends | 英文 | King of the Jungle / Dance-A-Long with Lyrics / Kids Worship |
| CJ and Friends | 英文 | Love the Lord / Kids Worship Motions with Lyrics / CJ and Friends |
| CJ and Friends | 英文 | Peace Like A River / Kids Worship Motions with Lyrics / CJ and Friends |
| CJ and Friends | 英文 | Every Move I Make / Dance-A-Long with Lyrics / Kids Worship |
| CJ and Friends | 英文 | I Am the Way / John 14:6 / Kids VBS Dance |
| CJ and Friends | 英文 | Father Abraham Had Many Sons / Dance-A-Long with Lyrics / Kids Worship |
| Yancy | 英文 | Yancy - Hosanna Rock REMIX [OFFICIAL LYRIC MUSIC VIDEO] Little Praise Party - Palm Sunday Worship |
| Yancy | 英文 | Yancy - O Come All Ye Faithful [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas Let Us Adore Him |
| Yancy | 英文 | Yancy - Christmastime [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas - Peace, love, joy, hope |
| Yancy | 英文 | Yancy - The Greatest Gift [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas - Story of Jesus Birth |
| Yancy | 英文 | Yancy - The First Noel [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas - Worship Song Carol |
| Yancy | 英文 | Yancy - Wonderful Christmastime [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas |
| Yancy | 英文 | Yancy - Merry Christmas Happy Christmas [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas |
| Yancy | 英文 | Yancy - Angels We Have Heard On High [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas - Song |
| Yancy | 英文 | Yancy - Have Yourself A Merry Little Christmas [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas |
| Yancy | 英文 | Yancy - Joy To The World [OFFICIAL LYRIC VIDEO] Have a Fancy Yancy Christmas - Christmas Worship |
| Yancy | 英文 | Yancy - O Come O Come Emmanuel [OFFICIAL LYRIC VIDEO] Christmas Kids Worship Song |
| Yancy | 英文 | Yancy - Silent Night [OFFICIAL LYRIC VIDEO] Christmas Kids Worship Song |
| Yancy | 英文 | Yancy - Little Drummer Boy [OFFICIAL LYRIC VIDEO] Kids Christmas Worship Song |
| Yancy | 英文 | Yancy & Little Praise Party - Away In A Manger [OFFICIAL MUSIC VIDEO] Christmas Kids Worship Song |
| Yancy | 英文 | Yancy & Little Praise Party - Not About The Weather [OFFICIAL MUSIC VIDEO] Kids Christmas Song |
| Yancy | 英文 | Yancy & Little Praise Party - Out of This World [OFFICIAL MUSIC VIDEO] Kids Worship Music Song |
| Yancy | 英文 | Yancy - Holy Spirit Come [OFFICIAL LYRIC VIDEO] Single for Kids Praise and Worship |
| Yancy | 英文 | Yancy & Little Praise Party - If You're Happy And You Know It [OFFICIAL KIDS WORSHIP] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - This Little Light Of Mine [OFFICIAL KIDS WORSHIP VID] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - The Shrink Song - [OFFICIAL KIDS WORSHIP MUSIC VIDEO] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - The B-I-B-L-E - [OFFICIAL KIDS WORSHIP MUSIC VIDEO] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - Mr. Noah Had An Ark - [OFFICIAL KIDS MUSIC VIDEO] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - Bye, Bye, Bye - [OFFICIAL KIDS MUSIC VIDEO] Happy Day Everyday - Fear |
| Yancy | 英文 | Yancy & Little Praise Party - It's Christmastime -[OFFICIAL KIDS MUSIC VIDEO] Happy Day Everyday |
| Yancy | 英文 | Yancy & Little Praise Party - Love One Another (Lullaby) - Happy Day Everyday  [OFFICIAL KIDS VIDEO] |
| Yancy | 英文 | Yancy & Little Praise Party - Obey - [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See - obedience |
| Yancy | 英文 | Yancy & Little Praise Party - I Love You Lord- [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - There Are Promises - [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - Joyful Noise - [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - Best Present Ever- [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See |
| Yancy | 英文 | Yancy - God is Big and He Loves Me (La La La Hey Hey Hey) [OFFICIAL MUSIC VIDEO} Kids Worship |
| Yancy | 英文 | Yancy - Praise The Lord Every Day [OFFICIAL MUSIC VIDEO] VBS Kids Worship -Little Praise Party |
| Yancy | 英文 | Yancy - Ready Set Go Reimagined Lyric Video [OFFICIAL KIDS WORSHIP MUSIC VIDEO] |
| Yancy | 英文 | Yancy - Every Victory [OFFICIAL LYRIC VIDEO] from Every Victory Single for Kids Worship |
| Yancy | 英文 | Yancy & Little Praise Party - All the Things (OFFICIAL KIDS MUSIC VIDEO) from Out Of This World |
| Yancy | 英文 | Yancy & Little Praise Party EVEN WHEN [Official Kids Music Video] Out of This World - Emotions |
| Yancy | 英文 | Yancy & Little Praise Party - The Bunny Song [OFFICIAL KIDS MUSIC VIDEO] from Taste and See - EASTER |
| Yancy | 英文 | Yancy & Little Praise Party - The Opposite Song [OFFICIAL KIDS MUSIC VIDEO] from Out of This World |
| Yancy | 英文 | Yancy & Little Praise Party - Choosing Happy [OFFICIAL KIDS MUSIC VIDEO] from Out Of This World |
| Yancy | 英文 | Yancy - NOTHING ELSE [OFFICIAL LYRIC VIDEO] Kids Worship Video |
| Yancy | 英文 | Yancy - Glory To Your Name [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 6 - Kids Worship |
| Yancy | 英文 | Yancy - Who You Say I Am [OFFICIAL LYRIC VIDEO] Kids Worship |
| Yancy | 英文 | Yancy - There Is Power [OFFICIAL MUSIC VIDEO] from Kidmin Worship Vol. 4 |
| Yancy | 英文 | Yancy - Do Be Give Love [OFFICIAL MUSIC VIDEO] from Kidmin Worship Vol. 5 |
| Yancy | 英文 | Yancy &  Little Praise Party - Praise Party [OFFICIAL KIDS WORSHIP MUSIC VIDEO] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - Whoa, I Have Life [OFFICIAL KIDS WORSHIP MUSIC VDEO] My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - How Great Is Our God -[OFFICIAL KIDS WORSHIP MUSIC VIDEO] |
| Yancy | 英文 | Yancy & Little Praise Party - God Is So Good [OFFICIAL KIDS WORSHIP MUSIC VIDEO] My Best Friend |
| Yancy | 英文 | Lord I Thank You - Yancy & Little Praise Party [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See |
| Yancy | 英文 | Don't Be A Turkey - Yancy & Little Praise Party [OFFICIAL KIDS MUSIC VIDEO] Happy Day Everyday |
| Yancy | 英文 | Yancy & Little Praise Party - Don't Monkey Around with the Devil [OFFICIAL KIDS MUSIC VIDEO] |
| Yancy | 英文 | Yancy - It Is Well [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 1 |
| Yancy | 英文 | Yancy - Every Day & Every Night [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 3 |
| Yancy | 英文 | Yancy - I Stand Amazed [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 1 HYMNS |
| Yancy | 英文 | Yancy - All Things [OFFICIAL LYRIC VIDEO] from Jesus Music Box |
| Yancy | 英文 | Yancy - Better Than The Best Thing [OFFICIAL LYRIC VIDEO] from Jesus Music Box |
| Yancy | 英文 | Yancy - When We Pray [OFFICIAL LYRIC VIDEO] from Jesus Music Box |
| Yancy | 英文 | Yancy - Be Careful [OFFICIAL LYRIC VIDEO] from Jesus Music Box |
| Yancy | 英文 | Yancy & Little Praise Party - Brand New Day [OFFICIAL MUSIC VIDEO] from Happy Day Every Day |
| Yancy | 英文 | Yancy & Little Praise Party - My Best Friend {OFFICIAL MUSIC VIDEO] from My Best Friend |
| Yancy | 英文 | Yancy & Little Praise Party - I Will Pray [OFFICIAL MUSIC VIDEO] from Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - Love One Another [OFFICIAL MUSIC VIDEO] from Happy Day Everyday |
| Yancy | 英文 | Yancy & Little Praise Party - MADE IN THE IMAGE [OFFICIAL MUSIC VIDEO] Feat Erskin from Ready Set Go |
| Yancy | 英文 | Yancy & Little Praise Party - Hungry & Thirsty feat. Funny Man Dan [OFFICIAL MUSIC VIDEO] ReadySetGo |
| Yancy | 英文 | Yancy & Little Praise Party - I Love My Mom [OFFICIAL MUSIC VIDEO] from Ready Set Go - Mother's Day |
| Yancy | 英文 | Yancy & Little Praise Party - Stop and Go [OFFICIAL MUSIC VIDEO]  from Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - Ready Set Go [OFFICIAL MUSIC VIDEO] from Ready Set Go |
| Yancy | 英文 | Yancy & Little Praise Party - I Like To [OFFICIAL MUSIC VIDEO] from Happy Day Everyday |
| Yancy | 英文 | Yancy - Strength & Shield [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 6 |
| Yancy | 英文 | Yancy - NotAshamed [OFFICAL LYRIC VIDEO] from Jesus Music Box |
| Yancy | 英文 | Yancy - Trust & Believe [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 3 |
| Yancy | 英文 | Yancy & Little Praise Party - The Springtime Song [OFFICIAL MUSIC VIDEO] EASTER KIDS WORSHIP |
| Yancy | 英文 | Yancy & Little Praise Party - It's A Happy Day- [OFFICIAL MUSIC VIDEO] EASTER KIDS WORSHIP |
| Yancy | 英文 | Yancy & Little Praise Party - Super Wonderful -  [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - Go! [OFFICIAL PRESCHOOL MUSIC VIDEO] from Happy Day Everyday Missions |
| Yancy | 英文 | Yancy - Super Wonderful Comic Version [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 6 |
| Yancy | 英文 | Yancy - We Believe [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 4 Popular Worship Songs |
| Yancy | 英文 | Yancy - Live Differently [OFFICIAL LYRIC VIDEO] Kidmin Worship Vol. 5 Missions & Serving |
| Yancy | 英文 | Yancy - Shine and Serve [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 5 Missions & Serving |
| Yancy | 英文 | Yancy - Heartbeat For You [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 6 |
| Yancy | 英文 | Yancy - Forever & Ever [OFFICIAL LYRIC VIDEO] from Stars, Guitars & Megaphone Dreams |
| Yancy | 英文 | Yancy - I Love You [OFFICIAL LYRIC VIDEO] from Stars, Guitars & Megaphone Dreams |
| Yancy | 英文 | Yancy & Little Praise Party - As For Me [OFFICIAL MUSIC VIDEO] from Ready, Set, Go |
| Yancy | 英文 | Yancy & Little Praise Party - Praise the Lord Every Day [OFFICIAL MUSIC VIDEO] from Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - He's Alive, He's Alive [OFFICIAL EASTER KIDS WORSHIP MUSIC VIDEO] |
| Yancy | 英文 | Yancy & Little Praise Party - One, Two, Three [OFFICIAL PRESCHOOL MUSIC] 1 2 3 EASTER KIDS WORSHIP |
| Yancy | 英文 | Yancy & Little Praise Party - Hosanna Rock [OFFICIAL PRESCHOOL MUSIC VIDEO] Palm Sunday Song |
| Yancy | 英文 | Yancy - To God Be The Glory / Doxology [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 1 |
| Yancy | 英文 | Yancy & Little Praise Party - Shout! [OFFICIAL PRESCHOOL MUSIC VIDEO] from Happy Day Everyday |
| Yancy | 英文 | Yancy & Little Praise Party - Gonna Serve [OFFICIAL MUSIC VIDEO] from Taste and See |
| Yancy | 英文 | Yancy - Wanna Be Like Jesus [OFFICIAL LYRIC VIDEO] from Kidmin Worship Vol. 3 |
| Yancy | 英文 | Yancy & Little Praise Party - Coat of Many Colors [OFFICIAL MUSIC VIDEO] |
| Yancy | 英文 | Yancy - Coat of Many Colors - [OFFICIAL LYRIC VIDEO] |
| Yancy | 英文 | Yancy & Little Praise Party - My God Is Number One [OFFICIAL MUSIC VIDEO] from Taste and See |
| Yancy | 英文 | Yancy & Little Praise Party - Taste and See [OFFICIAL MUSIC VIDEO] from Taste and See |

## Flag 清單

### lang-suspect(照入 staging,但唔算定案,0 首)
(暫時冇)

### lang-unresolved(雙值團體判唔到,冇 insert,0 首)
(暫時冇 —— 而家 8 個有 channel 嘅團體都係單一 kidsLang,雙值嘅 611 Kids Worship channel:null 行唔到呢個 script)

## ✅ 重攞返(438 首,抽樣列頭 30 條)

| 團體 | 新語言 | 標題 |
|---|---|---|
| Saddleback Kids | 英文 | Paul on the Island of Malta / Hey-O!™ Stories of the Bible |
| Hillsong Kids | 英文 | Say Yes - Dance Actions Video / Hillsong Kids |
| Listener Kids | 英文 | Easter song for kids - "Alive Alive My Jesus Is Alive" |
| Hillsong Kids | 英文 | Love So Great - Dance Actions Video / Hillsong Kids |
| Hillsong Kids | 英文 | Forgive And Forget - Dance Actions Video / Hillsong Kids |
| Hillsong Kids | 英文 | Say Yes - Lyric Video / Hillsong Kids |
| Hillsong Kids | 英文 | Love So Great - Lyric Video / Hillsong Kids |
| Listener Kids | 英文 | O Come All Ye Faithful - Christmas song for kids |
| Listener Kids | 英文 | The First Noel - Christmas song for kids |
| Hillsong Kids | 英文 | Forgive And Forget - Lyric Video / Hilsong Kids |
| Hillsong Kids | 英文 | Sons And Daughters - Dance Actions Video / Hillsong Kids |
| Hillsong Kids | 英文 | Running - Dance Actions Video / Hillsong Kids |
| Listener Kids | 英文 | Children Go Where I Send Thee - Christian Christmas video for kids |
| Listener Kids | 英文 | Angels We Have Heard on High - Christian Christmas songs for kids! |
| Hillsong Kids | 英文 | Running - Music Video / Hillsong Kids |
| Hillsong Kids | 英文 | Sons And Daughters - Lyric Video / Hillsong Kids |
| Hillsong Kids | 英文 | Running - Lyric Video / Hillsong Kids |
| Listener Kids | 英文 | Kids Praise / Whisper A Prayer In the Morning / Toddler song |
| Hillsong Kids | 英文 | Piano Lullabies (Great I AM) / Hillsong Kids |
| Hillsong Kids | 英文 | God Is Great - Actions Video / Hillsong Kids |
| Listener Kids | 英文 | Give Me Oil in My Lamp (NEW version) Bible Song for kids |
| Listener Kids | 英文 | Dem Bones Gonna Walk Around by Listener Kids |
| Hillsong Kids | 英文 | All Day - Actions Video / Hillsong Kids |
| Hillsong Kids | 英文 | Let It Shine (This Little Light Of Mine) |
| Hillsong Kids | 英文 | 1 Thessalonians 5:16-18 Always Be Joyful |
| Listener Kids | 英文 | Oh How I Love Jesus (new version) |
| Listener Kids | 英文 | Go Tell It On The Mountain - Christian Praise by Listener Kids - Celebrate the birth of Jesus |
| Hillsong Kids | 英文 | Proverbs 4:2-23 - Listen Closely / Hillsong Kids |
| Hillsong Kids | 英文 | Hebrews 10:35-36 - Keep On Being Brave / Hillsong Kids |
| Hillsong Kids | 英文 | Psalm 92:13 - Planted / Hillsong Kids |
| … | … | (仲有 408 首,見 kids_refetch table) |
