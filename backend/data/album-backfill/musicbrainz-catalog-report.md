# backfillAlbumFromMusicBrainzCatalog 報告 —— 國際英文 org 群(MusicBrainz API)

> 生成時間:2026-08-17 13:28:55

- 候選 row 總數:1340
- match 到單一專輯且已寫(或 --dry 模擬):31
- match 到但撞多隻專輯(衝突,冇寫):30
- match 到但 DB 已有 album(冇覆寫):349
- match 到但 album_source=manual/legacy(受保護,冇覆寫):0
- org 喺 catalog 完全冇料:208
- catalog 有料但搵唔到:722
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):30.6%

## 逐 org 明細

| org | 候選 row 數 | 本輪新寫(或模擬) |
|---|---|---|
| Phil Wickham | 83 | 14 |
| Bethel Music | 123 | 8 |
| Elevation Worship | 107 | 5 |
| Hillsong Worship | 162 | 3 |
| Chris Tomlin | 39 | 1 |
| Passion | 42 | 0 |
| Cody Carnes | 92 | 0 |
| Hillsong UNITED | 25 | 0 |
| CityAlight | 25 | 0 |
| Jesus Image | 25 | 0 |
| Mosaic MSC | 25 | 0 |
| Worship Together | 25 | 0 |
| Milk&Honey | 69 | 0 |
| KEC Worship | 82 | 0 |
| Endless Worship | 31 | 0 |
| Hillsong Kids | 100 | 0 |
| Listener Kids | 51 | 0 |
| CJ and Friends | 67 | 0 |
| Yancy | 110 | 0 |
| Giggles and Tunes | 57 | 0 |

## 已寫(或 --dry 模擬)清單(頭 300 條)

| id | org | title | matched_on | album |
|---|---|---|---|---|
| 449 | Hillsong Worship | My Redeemer Lives | my redeemer lives | Shout to the Lord 2000 |
| 505 | Bethel Music | God I Look To You - Bethany Wohrle Heaven Come 2018 | god i look to you | Be Lifted High |
| 622 | Chris Tomlin | Passion - How Great Is Our God (World Edition) feat. | how great is our god world edition | How Great is Our God: The Essential Collection |
| 895 | Hillsong Worship | Eagle's Wings | eagle s wings | Shout to the Lord: The Platinum Collection |
| 904 | Bethel Music | The Blood - by , Jenn Johnson & David Funk | the blood | Simple |
| 928 | Bethel Music | Give Me Jesus - Kate Serban | give me jesus | Discover Bethel Music |
| 964 | Bethel Music | No One Like The Lord/Nadie Como El Señor - Jenn Johnson, Christine | no one like the lord | We Must Respond |
| 1005 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints |
| 1006 | Phil Wickham | So So Good | so so good | Song Of The Saints |
| 1017 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints |
| 1025 | Phil Wickham | CAIN - God Is Good | god is good | Song Of The Saints |
| 1034 | Elevation Worship | I Know A Name \| From Nights | i know a name | I Know a Name |
| 1069 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints |
| 1071 | Bethel Music | Made For More - Bethany Wohrle | made for more | We Must Respond |
| 1082 | Elevation Worship | Jesus Be The Name \| Lyric | jesus be the name | Jesus Be The Name |
| 1090 | Phil Wickham | God Is Good | god is good | Song Of The Saints |
| 1119 | Hillsong Worship | Eagle's Wings | eagle s wings | Shout to the Lord: The Platinum Collection |
| 1134 | Bethel Music | Give Me Jesus - Kate Serban | give me jesus | Discover Bethel Music |
| 1157 | Bethel Music | Made For More - Bethany Wohrle | made for more | We Must Respond |
| 1164 | Bethel Music | The Blood - by , Jenn Johnson & David Funk | the blood | Simple |
| 1184 | Elevation Worship | Same God \| From Nights | same god | LION |
| 1185 | Elevation Worship | I Know A Name \| From Nights | i know a name | I Know a Name |
| 1190 | Elevation Worship | Jesus Be The Name \| Lyric | jesus be the name | Jesus Be The Name |
| 1221 | Phil Wickham | CAIN - God Is Good | god is good | Song Of The Saints |
| 1232 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints |
| 1233 | Phil Wickham | Resurrection Story | resurrection story | Song Of The Saints |
| 1236 | Phil Wickham | So So Good | so so good | Song Of The Saints |
| 1241 | Phil Wickham | The Day I Met You | the day i met you | Song Of The Saints |
| 1242 | Phil Wickham | God Is Good | god is good | Song Of The Saints |
| 1246 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints |
| 1247 | Phil Wickham | Brandon Lake, Elevation Worship - So So Good | so so good | Song Of The Saints |

## 衝突清單(撞多隻專輯,人手覆核)

| id | org | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 426 | Hillsong Worship | Who You Say I Am | who you say i am | Take Heart (Again) / WOW Hits 2019 / There Is More / Who You Say I Am |
| 427 | Hillsong Worship | I Give You My Heart - Delirious? | i give you my heart | God Is in the House / The Secret Place: Hillsong Instrumental Series, Volume 1 / The Very Best of Hillsong Live / Simply Worship / Millennium: The Story So Far / (UP) Unified:Praise |
| 429 | Hillsong Worship | Grace To Grace | grace to grace | Grace to Grace / Let There Be Light |
| 431 | Hillsong Worship | Shout To The Lord | shout to the lord | Shout to the Lord / Shout to the Lord 2: The Platinum Collection, Volume 2 / Shout to the Lord 2000 / Simply Worship / Shout to the Lord: The Platinum Collection / Shout to the Lord: Special Gold Edition / Revival: Songs of Fire From Above / Shout To the Lord (Performance Trax) / Extravagant Worship: The Songs of Darlene Zschech / Ultimate Worship |
| 437 | Hillsong Worship | You Are My Strength | you are my strength | Saviour King (Backing Tracks) / Saviour King |
| 454 | Hillsong Worship | Made Me Glad | made me glad | Extravagant Worship: The Songs of Miriam Webster / iWorsh!p: Platinum / Blessed / The Very Best of Hillsong Live / Shout to the Lord 2: The Platinum Collection, Volume 2 / Piano Reflections Volume 4 / Ultimate Worship |
| 469 | Bethel Music | He Has Done Great Things (Live) - Jenn Johnson | he has done great things live | We Must Respond / I Want Jesus (Live) |
| 472 | Bethel Music | Goodness Of God (LIVE) - Jenn Johnson VICTORY | goodness of god | Songs For Easter / Victory / Peace / Without Words: Genesis |
| 476 | Bethel Music | Living Hope / Glorify Thy Name (Spontaneous) - Kristene DiMarco | living hope | Without Words: Genesis / Peace, Vol. II / Victory |
| 478 | Bethel Music | Holy Forever (Live) - Jenn Johnson, feat. CeCe Winans | holy forever live | Holy Forever (Live) / Moments: Wait (Live) |
| 484 | Bethel Music | Holy Forever (Live) - Jenn Johnson, and Natalie Grant | holy forever live | Holy Forever (Live) / Moments: Wait (Live) |
| 494 | Bethel Music | Surrounded By Holy - Zahriya Zachary | surrounded by holy | Come Up Here / Surrounded By Holy |
| 497 | Bethel Music | He Has Done Great Things (Live) - JohnWilds | he has done great things live | We Must Respond / I Want Jesus (Live) |
| 509 | Bethel Music | Raise A Hallelujah (LIVE) - Jonathan and Melissa Helser VICTORY | raise a hallelujah | Victory / Without Words: Genesis / Peace |
| 610 | Chris Tomlin | Holy Forever / How Great Is Our God - Charlie Kirk Memorial (LIVE) | how great is our god | How Great Is Our God - Die schönsten internationalen Lobpreissongs 1 / Passion: The Essential Collection / How Great is Our God: The Essential Collection / Exit Music Worship And Prayer To Move Us Out / Encounter Worship Vol 1 / How Great Is Our God / The Best LIVE Worship Album... Ever! / Live From Austin Music Hall / Top 25 Praise Songs: Reckless Love / Worship Jamz Red |
| 612 | Chris Tomlin | Our God (Live) | our god | Passion: Here for You / Passion: Awakening / Passion: The Essential Collection / And If Our God Is for Us… / Top 25 Praise Songs: Reckless Love |
| 617 | Chris Tomlin | How Great Is Our God (Live In Nashville 2022) ft. Hillsong UNITED | how great is our god | How Great Is Our God - Die schönsten internationalen Lobpreissongs 1 / Passion: The Essential Collection / How Great is Our God: The Essential Collection / Exit Music Worship And Prayer To Move Us Out / Encounter Worship Vol 1 / How Great Is Our God / The Best LIVE Worship Album... Ever! / Live From Austin Music Hall / Top 25 Praise Songs: Reckless Love / Worship Jamz Red |
| 625 | Chris Tomlin | How Great Is Our God (Lyrics And Chords) | how great is our god | How Great Is Our God - Die schönsten internationalen Lobpreissongs 1 / Passion: The Essential Collection / How Great is Our God: The Essential Collection / Exit Music Worship And Prayer To Move Us Out / Encounter Worship Vol 1 / How Great Is Our God / The Best LIVE Worship Album... Ever! / Live From Austin Music Hall / Top 25 Praise Songs: Reckless Love / Worship Jamz Red |
| 629 | Chris Tomlin | Good Good Father ft. Pat Barrett | good good father | Never Lose Sight (Deluxe Edition) / The Ultimate Playlist / Chris Tomlin Collection / SOZO Playlists: Top Worship Songs |
| 630 | Chris Tomlin | Good Good Father (Audio) | good good father | Never Lose Sight (Deluxe Edition) / The Ultimate Playlist / Chris Tomlin Collection / SOZO Playlists: Top Worship Songs |
| 812 | Cody Carnes | Nothing Else / The Belonging Co | nothing else | SOZO Playlists: Top Worship Songs / Run To The Father |
| 816 | Cody Carnes | Nothing Else | nothing else | SOZO Playlists: Top Worship Songs / Run To The Father |
| 1048 | Bethel Music | Living Hope - @JohnWilds | living hope | Without Words: Genesis / Peace, Vol. II / Victory |
| 2102 | Hillsong Kids | Superhero - Song Story | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 2127 | Hillsong Kids | Jesus Is My Superhero - 20th Birthday from \| Trailer | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4432 | Hillsong Kids | Superhero - Dance Video | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4437 | Hillsong Kids | Superhero (Billy Davis Remix) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4438 | Hillsong Kids | Superhero (Slowed Down/Pitched Up) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4439 | Hillsong Kids | Superhero (Sped Up) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |
| 4440 | Hillsong Kids | Superhero (Reimagined) | superhero | Live Worship for Kids / Ultimate Collection / Jesus Is My Superhero |

(catalog 完全冇料嘅 org 殘餘 208 首、catalog 有料但搵唔到嘅 722 首、
DB 已有 album 冇覆寫嘅 349 首、album_source=manual/legacy 受保護嘅 0 首,
唔逐條列,見上面統計數字。)
