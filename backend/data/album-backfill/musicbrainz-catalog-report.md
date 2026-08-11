# backfillAlbumFromMusicBrainzCatalog 報告 —— 國際英文 org 群(MusicBrainz API)

> 生成時間:2026-08-11 10:25:06

- 候選 row 總數:1339
- match 到單一專輯且已寫(或 --dry 模擬):216
- match 到但撞多隻專輯(衝突,冇寫):81
- match 到但 DB 已有 album(冇覆寫):113
- match 到但 album_source=manual/legacy(受保護,冇覆寫):0
- org 喺 catalog 完全冇料:208
- catalog 有料但搵唔到:721
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):30.6%

## 逐 org 明細

| org | 候選 row 數 | 本輪新寫(或模擬) |
|---|---|---|
| Cody Carnes | 92 | 38 |
| Elevation Worship | 107 | 30 |
| Hillsong Worship | 162 | 28 |
| Listener Kids | 51 | 27 |
| Hillsong UNITED | 25 | 18 |
| CityAlight | 25 | 18 |
| Yancy | 110 | 17 |
| Phil Wickham | 83 | 14 |
| Mosaic MSC | 25 | 14 |
| Bethel Music | 123 | 9 |
| Hillsong Kids | 100 | 2 |
| Chris Tomlin | 39 | 1 |
| Passion | 42 | 0 |
| Jesus Image | 25 | 0 |
| Worship Together | 25 | 0 |
| Milk&Honey | 69 | 0 |
| KEC Worship | 82 | 0 |
| Endless Worship | 30 | 0 |
| CJ and Friends | 67 | 0 |
| Giggles and Tunes | 57 | 0 |

## 已寫(或 --dry 模擬)清單(頭 300 條)

| id | org | title | matched_on | album |
|---|---|---|---|---|
| 466 | Hillsong Worship | Hosanna - Live from the Steps on the Temple Mount | hosanna live | Hillsong: Let Hope Rise (Live/Original Motion Picture Soundtrack) |
| 500 | Bethel Music | Build My Life - Peyton Allen Moment | build my life | Peace, Vol. II |
| 571 | Elevation Worship | If you're feeling grateful... | grateful | There Is a Cloud |
| 620 | Chris Tomlin | Amazing Grace (My Chains Are Gone) (Live) | amazing grace my chains are gone live | God of This City |
| 859 | Cody Carnes | Who Is this Man | who is this man | Firm Foundation |
| 863 | Cody Carnes | Brandon Lake - Too Good To Not Believe | too good to not believe | Too Good to Not Believe |
| 872 | Bethel Music | When I Think About The Lord / He Has Done Great Things - @JohnW | he has done great things | We Must Respond |
| 910 | Cody Carnes | Be Glad | be glad | Firm Foundation (Live) |
| 971 | Bethel Music | He Has Done Great Things - Aubree Archibeck | he has done great things | We Must Respond |
| 984 | Elevation Worship | Sure Been Good, What A Friend, Trust In God \| Still Sessions | trust in god | CAN YOU IMAGINE? |
| 987 | Elevation Worship | Wait On You | wait on you | Old Church Basement |
| 989 | Phil Wickham | Running To A Runaway | running to a runaway | Song Of The Saints (Deluxe) |
| 990 | Cody Carnes | Be Glad | be glad | Firm Foundation (Live) |
| 991 | Cody Carnes | Too Good To Not Believe + Our God Reigns | too good to not believe | Too Good to Not Believe |
| 992 | Cody Carnes | Christ Be Magnified | christ be magnified | Burn Bright |
| 994 | Phil Wickham | Crowder - It Really Is Amazing Grace | it really is amazing grace | It Really Is Amazing Grace |
| 997 | Hillsong Worship | Only Jesus - Acoustic | only jesus acoustic | Great I Am (Acoustic) |
| 1002 | Elevation Worship | God I’m Just Grateful \| Acoustic \| Chandler Moore | grateful | There Is a Cloud |
| 1003 | Bethel Music | O Holy Night / Holy Forever - Garett & Kate | o holy night holy forever | O Holy Night/Holy Forever |
| 1007 | Cody Carnes | Kari Jobe - Christ Be Magnified | christ be magnified | Burn Bright |
| 1009 | Cody Carnes | Let The Light In | let the light in | Run To The Father |
| 1012 | Hillsong Worship | On Repeat / All To Him | all to him | These Same Skies |
| 1018 | Hillsong Worship | All To Him | all to him | These Same Skies |
| 1019 | Elevation Worship | Owe You Praise | owe you praise | When Wind Meets Fire |
| 1020 | Cody Carnes | All My Delight | all my delight | Run To The Father |
| 1022 | Elevation Worship | Keep On | keep on | SO BE IT |
| 1026 | Phil Wickham | Crowder - It Really Is Amazing Grace | it really is amazing grace | It Really Is Amazing Grace |
| 1029 | Cody Carnes | Call On The Name | call on the name | Firm Foundation |
| 1030 | Elevation Worship | SO BE IT \| Lyric | so be it | SO BE IT |
| 1031 | Phil Wickham | Crowder - It Really Is Amazing Grace | it really is amazing grace | It Really Is Amazing Grace |
| 1038 | Hillsong Worship | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1041 | Hillsong Worship | Good News - Acoustic | good news | Great I AM |
| 1042 | Elevation Worship | SO BE IT \| Begin With Amen \| Pastor Steven Furtick | so be it | SO BE IT |
| 1045 | Cody Carnes | Plead The Blood | plead the blood | Firm Foundation |
| 1053 | Cody Carnes | Christ Be Magnified | christ be magnified | Burn Bright |
| 1054 | Cody Carnes | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1055 | Cody Carnes | The Vow | the vow | Run To The Father |
| 1058 | Hillsong Worship | Only Jesus | only jesus | Great I AM |
| 1062 | Phil Wickham | Song Of The Saints | song of the saints | Song Of The Saints (Deluxe) |
| 1063 | Hillsong Worship | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1064 | Elevation Worship | Alleluia \| Lyric \| Chandler Moore | alleluia | SO BE IT |
| 1073 | Cody Carnes | Power In The Blood | power in the blood | Run To The Father |
| 1075 | Hillsong Worship | Never Walk Alone | never walk alone | These Same Skies |
| 1077 | Hillsong Worship | Good News - Lyric | good news | Great I AM |
| 1078 | Cody Carnes | The Blessing - From Home | the blessing | The Blessing |
| 1088 | Cody Carnes | Be Glad | be glad | Firm Foundation (Live) |
| 1089 | Hillsong Worship | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1091 | Cody Carnes | Let The Light In | let the light in | Run To The Father |
| 1092 | Hillsong Worship | That's The Power | that s the power | These Same Skies |
| 1096 | Hillsong Worship | Good News - Acoustic | good news | Great I AM |
| 1097 | Hillsong Worship | Only Jesus - Acoustic | only jesus acoustic | Great I Am (Acoustic) |
| 1098 | Hillsong Worship | Good News - Lyric | good news | Great I AM |
| 1099 | Hillsong Worship | Only Jesus - Lyric | only jesus | Great I AM |
| 1100 | Hillsong Worship | Good News | good news | Great I AM |
| 1101 | Hillsong Worship | Only Jesus | only jesus | Great I AM |
| 1103 | Hillsong Worship | Fighting For Us - Acoustic | fighting for us | Great I AM |
| 1105 | Hillsong Worship | Yahweh Great I AM - Acoustic | yahweh great i am acoustic | Great I Am (Acoustic) |
| 1106 | Hillsong Worship | Fighting For Us - Lyric | fighting for us | Great I AM |
| 1113 | Hillsong Worship | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1115 | Hillsong Worship | On Repeat / All To Him | all to him | These Same Skies |
| 1120 | Hillsong Worship | Never Walk Alone | never walk alone | These Same Skies |
| 1121 | Hillsong Worship | That's The Power | that s the power | These Same Skies |
| 1126 | Hillsong Worship | All To Him | all to him | These Same Skies |
| 1127 | Hillsong Worship | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1129 | Hillsong Worship | That's The Power | that s the power | These Same Skies |
| 1135 | Bethel Music | He Has Done Great Things - Aubree Archibeck | he has done great things | We Must Respond |
| 1155 | Bethel Music | He's The One - Emmy Rose | he s the one | We Must Respond |
| 1158 | Bethel Music | Another Like You - David Funk | another like you | We Must Respond |
| 1159 | Bethel Music | Even Though I Walk - Kari Jobe Carnes, Hannah McClure | even though i walk | We Must Respond |
| 1161 | Bethel Music | O Holy Night / Holy Forever - Garett & Kate | o holy night holy forever | O Holy Night/Holy Forever |
| 1166 | Elevation Worship | Alleluia | alleluia | SO BE IT |
| 1167 | Elevation Worship | Call God \| Acoustic \| Chandler Moore | call god | SO BE IT |
| 1168 | Elevation Worship | Thank You \| From The Warehouse | thank you | SO BE IT |
| 1169 | Elevation Worship | SO BE IT \| Begin With Amen \| Pastor Steven Furtick | so be it | SO BE IT |
| 1170 | Elevation Worship | Alleluia \| From The Warehouse | alleluia | SO BE IT |
| 1171 | Elevation Worship | SO BE IT \| From The Warehouse | so be it | SO BE IT |
| 1172 | Elevation Worship | Your Name Is God \| Leeland Mooring | your name is god | SO BE IT |
| 1173 | Elevation Worship | Keep On | keep on | SO BE IT |
| 1174 | Elevation Worship | Call God \| Chandler Moore | call god | SO BE IT |
| 1175 | Elevation Worship | I Got Saved | i got saved | SO BE IT |
| 1176 | Elevation Worship | Thank You \| Lyric | thank you | SO BE IT |
| 1177 | Elevation Worship | Your Name Is God \| Lyric \| Leeland Mooring | your name is god | SO BE IT |
| 1178 | Elevation Worship | Keep On \| Lyric | keep on | SO BE IT |
| 1179 | Elevation Worship | Call God \| Lyric \| Chandler Moore | call god | SO BE IT |
| 1180 | Elevation Worship | I Got Saved \| Lyric | i got saved | SO BE IT |
| 1181 | Elevation Worship | Alleluia \| Lyric \| Chandler Moore | alleluia | SO BE IT |
| 1182 | Elevation Worship | SO BE IT \| Lyric | so be it | SO BE IT |
| 1183 | Elevation Worship | God I’m Just Grateful \| Acoustic \| Chandler Moore | grateful | There Is a Cloud |
| 1186 | Elevation Worship | Wait On You | wait on you | Old Church Basement |
| 1189 | Elevation Worship | God I’m Just Grateful \| Lyric \| Chandler Moore | grateful | There Is a Cloud |
| 1192 | Elevation Worship | Sure Been Good, What A Friend, Trust In God \| Still Sessions | trust in god | CAN YOU IMAGINE? |
| 1222 | Phil Wickham | Crowder - It Really Is Amazing Grace | it really is amazing grace | It Really Is Amazing Grace |
| 1223 | Phil Wickham | Crowder - It Really Is Amazing Grace | it really is amazing grace | It Really Is Amazing Grace |
| 1224 | Phil Wickham | Crowder - It Really Is Amazing Grace | it really is amazing grace | It Really Is Amazing Grace |
| 1231 | Phil Wickham | Running To A Runaway | running to a runaway | Song Of The Saints (Deluxe) |
| 1234 | Phil Wickham | Miracle Maker | miracle maker | Song Of The Saints (Deluxe) |
| 1235 | Phil Wickham | What If I Told You | what if i told you | Song Of The Saints (Deluxe) |
| 1237 | Phil Wickham | Running To A Runaway | running to a runaway | Song Of The Saints (Deluxe) |
| 1239 | Phil Wickham | Wondrous Cross | wondrous cross | Song Of The Saints (Deluxe) |
| 1245 | Phil Wickham | What An Awesome God | what an awesome god | Song Of The Saints |
| 1251 | Cody Carnes | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1252 | Cody Carnes | Be Glad | be glad | Firm Foundation (Live) |
| 1254 | Cody Carnes | Firm Foundation + Great Are You Lord | firm foundation | Call on Heaven (Live from Passion 2024) |
| 1255 | Cody Carnes | Hope Of The Ages | hope of the ages | Hope of the Ages |
| 1257 | Cody Carnes | Be Glad | be glad | Firm Foundation (Live) |
| 1259 | Cody Carnes | The Dove | the dove | Firm Foundation |
| 1260 | Cody Carnes | Plead The Blood | plead the blood | Firm Foundation |
| 1261 | Cody Carnes | Firm Foundation | firm foundation | Call on Heaven (Live from Passion 2024) |
| 1262 | Cody Carnes | Call On The Name | call on the name | Firm Foundation |
| 1263 | Cody Carnes | Who Is this Man | who is this man | Firm Foundation |
| 1266 | Cody Carnes | Too Good To Not Believe + Our God Reigns | too good to not believe | Too Good to Not Believe |
| 1271 | Cody Carnes | Be Glad | be glad | Firm Foundation (Live) |
| 1274 | Cody Carnes | Firm Foundation | firm foundation | Call on Heaven (Live from Passion 2024) |
| 1275 | Cody Carnes | Brandon Lake - Too Good To Not Believe | too good to not believe | Too Good to Not Believe |
| 1276 | Cody Carnes | Christ Be Magnified | christ be magnified | Burn Bright |
| 1277 | Cody Carnes | Kari Jobe - Christ Be Magnified | christ be magnified | Burn Bright |
| 1278 | Cody Carnes | Kari Jobe - Run to the Father | run to the father | Run To The Father |
| 1280 | Cody Carnes | Power In The Blood | power in the blood | Run To The Father |
| 1281 | Cody Carnes | Let The Light In | let the light in | Run To The Father |
| 1282 | Cody Carnes | Christ Be Magnified | christ be magnified | Burn Bright |
| 1388 | Hillsong UNITED | Mercy Mercy - Redux | mercy mercy | Zion |
| 1389 | Hillsong UNITED | Scandal of Grace - at Team Night 2013 | scandal of grace | Zion |
| 1390 | Hillsong UNITED | Love is War - at Team Night 2013 | love is war | Zion |
| 1392 | Hillsong UNITED | Love is War - Redux | love is war redux | Zion |
| 1396 | Hillsong UNITED | Mercy Mercy - at Team Night 2013 | mercy mercy | Zion |
| 1397 | Hillsong UNITED | A Million Suns - Redux | a million suns redux | Zion |
| 1398 | Hillsong UNITED | Stay and Wait - at Red Rocks 2013 | stay and wait | Zion |
| 1399 | Hillsong UNITED | Love is War - from Atlanta 2013 | love is war | Zion |
| 1401 | Hillsong UNITED | Heartbeats - Redux | heartbeats redux | Zion |
| 1402 | Hillsong UNITED | Scandal of Grace - at Red Rocks 2013 | scandal of grace | Zion |
| 1403 | Hillsong UNITED | Up In Arms - Redux | up in arms redux | Zion |
| 1404 | Hillsong UNITED | Up In Arms - at Team Night 2013 | up in arms | Zion |
| 1405 | Hillsong UNITED | Nothing Like Your Love / Zion - Redux | nothing like your love | Zion |
| 1406 | Hillsong UNITED | Nothing Like Your Love - from Atlanta 2013 | nothing like your love | Zion |
| 1407 | Hillsong UNITED | Stay and Wait - Redux | stay and wait redux | Zion |
| 1408 | Hillsong UNITED | Relentless - Redux | relentless | Zion |
| 1409 | Hillsong UNITED | Tapestry - Redux | tapestry redux | Zion |
| 1410 | Hillsong UNITED | Nothing Like Your Love - at Team Night 2013 | nothing like your love | Zion |
| 1411 | CityAlight | Rise With The Sun | rise with the sun | Rise with the Sun |
| 1413 | CityAlight | All to Honour Jesus | all to honour jesus | Hear The Hallelujahs (Live) |
| 1415 | CityAlight | We Too Have Overcome | we too have overcome | Hear The Hallelujahs (Live) |
| 1416 | CityAlight | My Labour is Not in Vain | my labour is not in vain | Hear The Hallelujahs (Live) |
| 1417 | CityAlight | Hear the Hallelujahs Roar | hear the hallelujahs roar | Hear The Hallelujahs (Live) |
| 1422 | CityAlight | His Glory and My Good \| Acoustic | his glory and my good | His Glory and My Good |
| 1423 | CityAlight | His Glory and My Good | his glory and my good | His Glory and My Good |
| 1425 | CityAlight | Jerusalem | jerusalem | Yours Alone |
| 1426 | CityAlight | Jesus, Strong and Kind / Jesus Loves Me | jesus strong and kind jesus loves me | Simple Songs for Young and Old |
| 1427 | CityAlight | "THIS I KNOW" - The re-making of Jesus, Strong and Kind | jesus strong and kind | Jesus, Strong and Kind |
| 1428 | CityAlight | Day After Day, Jesus Reigns | day after day jesus reigns | Simple Songs for Young and Old |
| 1429 | CityAlight | God Is Over All | god is over all | Simple Songs for Young and Old |
| 1430 | CityAlight | The Lord Is By My Side | the lord is by my side | Simple Songs for Young and Old |
| 1431 | CityAlight | He Calls Me Friend | he calls me friend | Simple Songs for Young and Old |
| 1432 | CityAlight | My God is All I Need / My God is So Big | my god is all i need my god is so big | Simple Songs for Young and Old |
| 1433 | CityAlight | There is Hope | there is hope | There Is One Gospel |
| 1434 | CityAlight | Known and Loved | known and loved | There Is One Gospel |
| 1435 | CityAlight | Your Will Be Done | your will be done | There Is One Gospel |
| 1461 | Mosaic MSC | Won't Fear | won t fear | To God Be The Glory |
| 1462 | Mosaic MSC | So Good To Me | so good to me | To God Be The Glory |
| 1463 | Mosaic MSC | give + take | give take | To God Be The Glory |
| 1465 | Mosaic MSC | give + take | give take | To God Be The Glory |
| 1466 | Mosaic MSC | Electric Fire | electric fire | To God Be The Glory |
| 1468 | Mosaic MSC | Take My Breath Away | take my breath away | To God Be The Glory |
| 1469 | Mosaic MSC | Won't Fear | won t fear | To God Be The Glory |
| 1470 | Mosaic MSC | You Know What's Best For Me | you know what s best for me | To God Be The Glory |
| 1472 | Mosaic MSC | Hallelujah | hallelujah | To God Be The Glory |
| 1473 | Mosaic MSC | My Heart Belongs To You | my heart belongs to you | To God Be The Glory |
| 1474 | Mosaic MSC | Push My Fear to the Side | push my fear to the side | To God Be The Glory |
| 1476 | Mosaic MSC | So Good To Me | so good to me | To God Be The Glory |
| 1477 | Mosaic MSC | To God Be The Glory | to god be the glory | To God Be The Glory |
| 1478 | Mosaic MSC | To God Be The Glory | to god be the glory | To God Be The Glory |
| 4455 | Hillsong Kids | KIDS HEARTWARMING WORSHIP! 🙌 'What a Beautiful Name' - Live Recording! | what a beautiful name | Can You Believe It!? |
| 4472 | Listener Kids | Alive Alive (My Jesus is Alive) - Praise Song for | alive alive | My God Is so Big, Vol. 5 |
| 4473 | Listener Kids | Oh Be Careful Little Eyes - Bible Lesson Song for Preschooler | be careful little eyes | The Lord’s Army, Vol. 6 |
| 4474 | Listener Kids | Inright Outright (Happy All the Time) - Dance Along Kids Praise | inright outright happy all the time | The Lord’s Army, Vol. 6 |
| 4476 | Listener Kids | Down By the Riverside - Kids Song | down by the riverside | My God Is so Big, Vol. 5 |
| 4479 | Listener Kids | He's Got the Whole World in His Hands - Praise Song for | he s got the whole world in his hands | Sunday School Pop Vol. 2 |
| 4483 | Listener Kids | This Is the Day That the Lord Has Made - Kids Praise Song | this is the day that the lord has made | Sunday School Pop Vol. 2 |
| 4484 | Listener Kids | J-E-S-U-S by - animated bible song for kids | j e s u s | My God Is so Big, Vol. 5 |
| 4488 | Listener Kids | Joshua Fought the Battle of Jericho - Bible Story Song for Kids | joshua fought the battle of jericho | The Lord’s Army, Vol. 6 |
| 4489 | Listener Kids | Oh Be Careful Little Eyes What You See (With Lyrics) / Bible Song / Christian Video | be careful little eyes | The Lord’s Army, Vol. 6 |
| 4490 | Listener Kids | Get Moving with Father Abraham (with Motions) - An Engaging Bible Song for Kids! | father abraham | The Lord’s Army, Vol. 6 |
| 4491 | Listener Kids | Do Lord Oh Do Lord Oh Do Remember Me (with lyrics) | do lord oh do lord | My God Is so Big, Vol. 5 |
| 4492 | Listener Kids | I've Got A River Of life (with lyrics) | i ve got a river of life | My God Is so Big, Vol. 5 |
| 4493 | Listener Kids | My God Is So Big - (with lyrics) | my god is so big | My God Is so Big, Vol. 5 |
| 4494 | Listener Kids | J-E-S-U-S (with lyrics) | j e s u s | My God Is so Big, Vol. 5 |
| 4495 | Listener Kids | Down By The Riverside - (with lyrics) | down by the riverside | My God Is so Big, Vol. 5 |
| 4496 | Listener Kids | Alive Alive Alive Forevermore (with lyrics) | alive alive | My God Is so Big, Vol. 5 |
| 4497 | Listener Kids | Oh When The Saints Go Marching In (with lyrics) | oh when the saints | My God Is so Big, Vol. 5 |
| 4498 | Listener Kids | Clap Your Hands All Ye People (with lyrics) | clap your hands all ye people | My God Is so Big, Vol. 5 |
| 4499 | Listener Kids | Clap Your Hands All Ye People! / Kids Praise & Worship Bible Song | clap your hands all ye people | My God Is so Big, Vol. 5 |
| 4500 | Listener Kids | I've Got A River Of Life / Kids worship | i ve got a river of life | My God Is so Big, Vol. 5 |
| 4501 | Listener Kids | He's Got the Whole World in His Hands (Arky Arky Version) - Praise Song for Kids | he s got the whole world in his hands | Sunday School Pop Vol. 2 |
| 4502 | Listener Kids | Jesus Loves Me Remix \| @CJandFriends Dance-A-Long with Lyrics @ kids | jesus loves me | Let It Shine |
| 4504 | Listener Kids | "Jesus Loves Me" With Lyrics | jesus loves me | Let It Shine |
| 4505 | Listener Kids | The B-I-B-L-E, Thats The Book For Me! (Kids Praise and Worship) | the b i b l e | Sunday School Pop Vol. 2 |
| 4508 | Listener Kids | What A Mighty God We Serve (Kids Praise and Worship) | mighty god | Let It Shine |
| 4578 | Yancy | Hosanna Rock - #1 Song for Palm Sunday -Message from celebrating the kids and churches | hosanna rock | Happy Day Everyday |
| 4590 | Yancy | Hosanna Rock REMIX [OFFICIAL LYRIC MUSIC VIDEO] Little Praise Party - Palm Sunday Worship | hosanna rock | Happy Day Everyday |
| 4603 | Yancy | Little Praise Party - Away In A Manger Christmas Kids Worship Song | away in a manger | Happy Day Everyday |
| 4612 | Yancy | Little Praise Party - Bye, Bye, Bye - [OFFICIAL KIDS MUSIC VIDEO] Happy Day Everyday - Fear | bye bye bye | Happy Day Everyday |
| 4613 | Yancy | Little Praise Party - It's Christmastime -[OFFICIAL KIDS MUSIC VIDEO] Happy Day Everyday | it s christmastime | Happy Day Everyday |
| 4614 | Yancy | Little Praise Party - Love One Another (Lullaby) - Happy Day Everyday [OFFICIAL KIDS VIDEO] | love one another | Happy Day Everyday |
| 4617 | Yancy | Little Praise Party - There Are Promises - [OFFICIAL KIDS WORSHIP MUSIC VIDEO] Taste and See | there are promises | Adventures On Promise Island |
| 4639 | Yancy | Don't Be A Turkey - Little Praise Party [OFFICIAL KIDS MUSIC VIDEO] Happy Day Everyday | don t be a turkey | Happy Day Everyday |
| 4644 | Yancy | All Things from Jesus Music Box | all things | Adventures On Promise Island |
| 4646 | Yancy | When We Pray from Jesus Music Box | when we pray | Adventures On Promise Island |
| 4648 | Yancy | Little Praise Party - Brand New Day from Happy Day Every Day | brand new day | Happy Day Everyday |
| 4651 | Yancy | Little Praise Party - Love One Another from Happy Day Everyday | love one another | Happy Day Everyday |
| 4657 | Yancy | Little Praise Party - I Like To from Happy Day Everyday | i like to | Happy Day Everyday |
| 4658 | Yancy | Strength & Shield from Kidmin Worship Vol. 6 | strength shield | Deep Sea Discovery |
| 4661 | Yancy | Little Praise Party - The Springtime Song EASTER KIDS WORSHIP | the springtime song | Happy Day Everyday |
| 4675 | Yancy | Little Praise Party - One, Two, Three [OFFICIAL MUSIC] 1 2 3 EASTER KIDS WORSHIP | one two three | Happy Day Everyday |
| 4676 | Yancy | Little Praise Party - Hosanna Rock [OFFICIAL MUSIC VIDEO] Palm Sunday Song | hosanna rock | Happy Day Everyday |
| 4805 | Listener Kids | Easter song for kids - "Alive Alive My Jesus Is Alive" | alive alive | My God Is so Big, Vol. 5 |
| 4811 | Listener Kids | I Am a C-H-R-I-S-T-I-A-N - (SURPRISE ENDING) - Praise fun for Kids | i am a c h | Sunday School Pop Vol. 2 |
| 4827 | Hillsong Kids | Jesus, What A Beautiful Name - Piano Lullaby | what a beautiful name | Can You Believe It!? |

## 衝突清單(撞多隻專輯,人手覆核)

| id | org | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 424 | Hillsong Worship | I Surrender | i surrender | Cornerstone / Stone’s Been Rolled Away |
| 426 | Hillsong Worship | Who You Say I Am | who you say i am | Take Heart (Again) / WOW Hits 2019 / There Is More / Who You Say I Am |
| 427 | Hillsong Worship | I Give You My Heart - Delirious? | i give you my heart | God Is in the House / The Secret Place: Hillsong Instrumental Series, Volume 1 / The Very Best of Hillsong Live / Simply Worship / Millennium: The Story So Far / (UP) Unified:Praise |
| 429 | Hillsong Worship | Grace To Grace | grace to grace | Grace to Grace / Let There Be Light |
| 431 | Hillsong Worship | Shout To The Lord | shout to the lord | Shout to the Lord / Shout to the Lord 2: The Platinum Collection, Volume 2 / Shout to the Lord 2000 / Simply Worship / Shout to the Lord: The Platinum Collection / Shout to the Lord: Special Gold Edition / Revival: Songs of Fire From Above / Shout To the Lord (Performance Trax) / Extravagant Worship: The Songs of Darlene Zschech / Ultimate Worship |
| 432 | Hillsong Worship | To You | to you | Extravagant Worship: The Songs of Darlene Zschech / You Are My World |
| 433 | Hillsong Worship | Mighty to Save | mighty to save | From the Inside Out: 25 Favorite Worship Songs / Ultimate Worship Collection, Volume II / Worship for Your Family: 35 Top Worship Songs / The Very Best of Hillsong Live / Mighty To Save (The Sound Of Worshipping Generations) / One: Songs of Praise |
| 437 | Hillsong Worship | You Are My Strength | you are my strength | Saviour King (Backing Tracks) / Saviour King |
| 446 | Hillsong Worship | From The Inside Out - UNITED | from the inside out | Mighty To Save (The Sound Of Worshipping Generations) / Hillsong Acoustic Preview 02 / Ultimate Worship Collection, Volume II |
| 449 | Hillsong Worship | My Redeemer Lives | my redeemer lives | Songs 4 Worship: 50 Greatest Praise and Worship Songs / Shout to the Lord 2000 / Millennium: The Story So Far / Extravagant Worship: The Songs of Reuben Morgan / The Very Best of Hillsong Live / Shout to the Lord: Special Gold Edition |
| 454 | Hillsong Worship | Made Me Glad | made me glad | Extravagant Worship: The Songs of Miriam Webster / iWorsh!p: Platinum / Blessed / The Very Best of Hillsong Live / Shout to the Lord 2: The Platinum Collection, Volume 2 / Piano Reflections Volume 4 / Ultimate Worship |
| 458 | Hillsong Worship | Take It All - UNITED | take it all | Mighty To Save (The Sound Of Worshipping Generations) / The Very Best of Hillsong Live / God of All |
| 461 | Hillsong Worship | One Way | one way | Live to worship / For All You’ve Done / The Very Best of Hillsong Live |
| 463 | Hillsong Worship | Everyday - Delirious? | everyday | Twice As Fresh / (UP) Unified:Praise |
| 469 | Bethel Music | He Has Done Great Things (Live) - Jenn Johnson | he has done great things live | We Must Respond / I Want Jesus (Live) |
| 472 | Bethel Music | Goodness Of God (LIVE) - Jenn Johnson VICTORY | goodness of god | Songs For Easter / Victory / Peace / Without Words: Genesis |
| 476 | Bethel Music | Living Hope / Glorify Thy Name (Spontaneous) - Kristene DiMarco | living hope | Without Words: Genesis / Peace, Vol. II / Victory |
| 477 | Bethel Music | No One Like The Lord (Live) - Jenn Johnson | no one like the lord live | Center (Live) / We Must Respond |
| 478 | Bethel Music | Holy Forever (Live) - Jenn Johnson, feat. CeCe Winans | holy forever live | Holy Forever (Live) / Moments: Wait (Live) |
| 484 | Bethel Music | Holy Forever (Live) - Jenn Johnson, and Natalie Grant | holy forever live | Holy Forever (Live) / Moments: Wait (Live) |
| 494 | Bethel Music | Surrounded By Holy - Zahriya Zachary | surrounded by holy | Come Up Here / Surrounded By Holy |
| 497 | Bethel Music | He Has Done Great Things (Live) - JohnWilds | he has done great things live | We Must Respond / I Want Jesus (Live) |
| 502 | Bethel Music | Give Me Jesus (Spontaneous) Live - Abbie Gamboa, Jenn Johnson | give me jesus | Tides Live / Discover Bethel Music |
| 505 | Bethel Music | God I Look To You - Bethany Wohrle Heaven Come 2018 | god i look to you | Starlight / Without Words / Discover Bethel Music / Be Lifted High |
| 509 | Bethel Music | Raise A Hallelujah (LIVE) - Jonathan and Melissa Helser VICTORY | raise a hallelujah | Victory / Without Words: Genesis / Peace |
| 545 | Elevation Worship | Jesus Be The Name (feat. Tiffany Hudson) | jesus be the name | Jesus Be The Name / SO BE IT |
| 557 | Elevation Worship | Do It Again Live | do it again | Speak Revival / There Is a Cloud / WOW Hits 2019 |
| 567 | Elevation Worship | Jesus Be The Name From The Warehouse | jesus be the name | Jesus Be The Name / SO BE IT |
| 594 | Passion | Kristian Stanfill - More Like Jesus (Live) | more like jesus live | Passion Collection / Whole Heart |
| 610 | Chris Tomlin | Holy Forever / How Great Is Our God - Charlie Kirk Memorial (LIVE) | how great is our god | How Great Is Our God - Die schönsten internationalen Lobpreissongs 1 / Passion: The Essential Collection / How Great is Our God: The Essential Collection / Exit Music Worship And Prayer To Move Us Out / Encounter Worship Vol 1 / How Great Is Our God / The Best LIVE Worship Album... Ever! / Live From Austin Music Hall / Top 25 Praise Songs: Reckless Love / Worship Jamz Red |
| 612 | Chris Tomlin | Our God (Live) | our god | Passion: Here for You / Passion: Awakening / Passion: The Essential Collection / And If Our God Is for Us… / Top 25 Praise Songs: Reckless Love |
| 617 | Chris Tomlin | How Great Is Our God (Live In Nashville 2022) ft. Hillsong UNITED | how great is our god | How Great Is Our God - Die schönsten internationalen Lobpreissongs 1 / Passion: The Essential Collection / How Great is Our God: The Essential Collection / Exit Music Worship And Prayer To Move Us Out / Encounter Worship Vol 1 / How Great Is Our God / The Best LIVE Worship Album... Ever! / Live From Austin Music Hall / Top 25 Praise Songs: Reckless Love / Worship Jamz Red |
| 619 | Chris Tomlin | Nobody Loves Me Like You | nobody loves me like you | Holy Roar: Live From Church / Holy Roar |
| 622 | Chris Tomlin | Passion - How Great Is Our God (World Edition) feat. | how great is our god world edition | How Great is Our God: The Essential Collection / Passion: White Flag |
| 625 | Chris Tomlin | How Great Is Our God (Lyrics And Chords) | how great is our god | How Great Is Our God - Die schönsten internationalen Lobpreissongs 1 / Passion: The Essential Collection / How Great is Our God: The Essential Collection / Exit Music Worship And Prayer To Move Us Out / Encounter Worship Vol 1 / How Great Is Our God / The Best LIVE Worship Album... Ever! / Live From Austin Music Hall / Top 25 Praise Songs: Reckless Love / Worship Jamz Red |
| 627 | Chris Tomlin | Indescribable (Lyrics And Chords) | indescribable | Arriving / How Great Is Our God |
| 629 | Chris Tomlin | Good Good Father ft. Pat Barrett | good good father | Never Lose Sight (Deluxe Edition) / The Ultimate Playlist / Chris Tomlin Collection / SOZO Playlists: Top Worship Songs |
| 630 | Chris Tomlin | Good Good Father (Audio) | good good father | Never Lose Sight (Deluxe Edition) / The Ultimate Playlist / Chris Tomlin Collection / SOZO Playlists: Top Worship Songs |
| 812 | Cody Carnes | Nothing Else / The Belonging Co | nothing else | SOZO Playlists: Top Worship Songs / Run To The Father |
| 816 | Cody Carnes | Nothing Else | nothing else | SOZO Playlists: Top Worship Songs / Run To The Father |
| 864 | Elevation Worship | I Know A Name \| Brandon Lake | i know a name | I Know a Name / SO BE IT |
| 895 | Hillsong Worship | Eagle's Wings | eagle s wings | Take Heart (Again) / Shout to the Lord: The Platinum Collection |
| 896 | Phil Wickham | Resurrection Story | resurrection story | Song Of The Saints (Deluxe) / Song Of The Saints |
| 897 | Elevation Worship | Same God \| From Nights | same god | LION / I’ve Witnessed It |
| 904 | Bethel Music | The Blood - by , Jenn Johnson & David Funk | the blood | Songs For Easter / Simple |
| 915 | Elevation Worship | I Know A Name \| Lyric \| Brandon Lake | i know a name | I Know a Name / SO BE IT |
| 928 | Bethel Music | Give Me Jesus - Kate Serban | give me jesus | Tides Live / Discover Bethel Music |
| 944 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints (Deluxe) / Song Of The Saints |
| 964 | Bethel Music | No One Like The Lord/Nadie Como El Señor - Jenn Johnson, Christine | no one like the lord | We Must Respond / Songs For Easter |
| 1005 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1006 | Phil Wickham | So So Good | so so good | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1017 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1025 | Phil Wickham | CAIN - God Is Good | god is good | Song Of The Saints / Song Of The Saints (Deluxe) |
| 1034 | Elevation Worship | I Know A Name \| From Nights | i know a name | I Know a Name / SO BE IT |
| 1048 | Bethel Music | Living Hope - @JohnWilds | living hope | Without Words: Genesis / Peace, Vol. II / Victory |
| 1069 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1071 | Bethel Music | Made For More - Bethany Wohrle | made for more | Songs For Easter / We Must Respond |
| 1082 | Elevation Worship | Jesus Be The Name \| Lyric | jesus be the name | Jesus Be The Name / SO BE IT |
| 1090 | Phil Wickham | God Is Good | god is good | Song Of The Saints / Song Of The Saints (Deluxe) |
| 1119 | Hillsong Worship | Eagle's Wings | eagle s wings | Take Heart (Again) / Shout to the Lord: The Platinum Collection |
| 1134 | Bethel Music | Give Me Jesus - Kate Serban | give me jesus | Tides Live / Discover Bethel Music |
| 1157 | Bethel Music | Made For More - Bethany Wohrle | made for more | Songs For Easter / We Must Respond |
| 1164 | Bethel Music | The Blood - by , Jenn Johnson & David Funk | the blood | Songs For Easter / Simple |
| 1184 | Elevation Worship | Same God \| From Nights | same god | LION / I’ve Witnessed It |
| 1185 | Elevation Worship | I Know A Name \| From Nights | i know a name | I Know a Name / SO BE IT |
| 1190 | Elevation Worship | Jesus Be The Name \| Lyric | jesus be the name | Jesus Be The Name / SO BE IT |
| 1221 | Phil Wickham | CAIN - God Is Good | god is good | Song Of The Saints / Song Of The Saints (Deluxe) |
| 1232 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1233 | Phil Wickham | Resurrection Story | resurrection story | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1236 | Phil Wickham | So So Good | so so good | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1241 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1242 | Phil Wickham | God Is Good | god is good | Song Of The Saints / Song Of The Saints (Deluxe) |
| 1246 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints (Deluxe) / Song Of The Saints |
| 1247 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints (Deluxe) / Song Of The Saints |
| 2102 | Hillsong Kids | Superhero - Song Story | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 2127 | Hillsong Kids | Jesus Is My Superhero - 20th Birthday from \| Trailer | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4432 | Hillsong Kids | Superhero - Dance Video | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4437 | Hillsong Kids | Superhero (Billy Davis Remix) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4438 | Hillsong Kids | Superhero (Slowed Down/Pitched Up) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4439 | Hillsong Kids | Superhero (Sped Up) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4440 | Hillsong Kids | Superhero (Reimagined) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |

(catalog 完全冇料嘅 org 殘餘 208 首、catalog 有料但搵唔到嘅 721 首、
DB 已有 album 冇覆寫嘅 113 首、album_source=manual/legacy 受保護嘅 0 首,
唔逐條列,見上面統計數字。)
