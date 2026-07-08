// 第一批詩歌資料
const { initDb, saveDb, getDb } = require('./db');

const hymns = [
  {
    title: '恩典太美麗',
    artist: 'ACM',
    category: '粵語',
    youtube_id: 'yT3r2Vl8G4I',
    duration: '5:01',
    lyrics: '無望的我 已失去方向|活在黑暗 找不到光亮|但你竟揀選我 再不棄掉我|恩典太美麗 叫我誇耀|誰能像你 愛我這麼深|竟為我犧牲 捨身救贖我|誰能像你 愛我這麼真|恩典太美麗 一生頌讚|讓我一生 歌頌你的愛|願我終生 跟隨不走開|恩典太美麗 叫我誇耀'
  },
  {
    title: '這一生最美的祝福',
    artist: '讚美之泉',
    category: '國語',
    youtube_id: 'k3aU3q6KHzI',
    duration: '5:12',
    lyrics: '在無數的黑夜裡 我用星星畫出你|你是我生命的亮光 照亮我前方的路|這一生最美的祝福 就是能認識主耶穌|這一生最美的祝福 就是能信靠主耶穌|走在高山深谷 祂會伴我同行|我知道這是最美的祝福'
  },
  {
    title: '我要向高山舉目',
    artist: '玻璃海',
    category: '粵語',
    youtube_id: 'lXqY1PpB3Nk',
    duration: '3:45',
    lyrics: '我要向高山舉目 我的幫助從何來|我的幫助從造天地的耶和華而來|祂必不叫你的腳搖動 保護你的必不打盹|保護以色列的 也不打盹 也不睡覺|保護你的是耶和華 祂在你右邊蔭庇你|白日太陽必不傷你 夜間月亮必不害你'
  },
  {
    title: '主禱文',
    artist: '讚美之泉',
    category: '國語',
    youtube_id: 'q7K8s9aB2cD',
    duration: '4:32',
    lyrics: '我們在天上的父 願人都尊你的名為聖|願你的國降臨 願你的旨意行在地上 如同行在天上|我們日用的飲食 今日賜給我們|免我們的債 如同我們免了人的債|不叫我們遇見試探 救我們脫離兇惡|因為國度 權柄 榮耀 全是你的 直到永遠|阿們'
  },
  {
    title: '深深愛你',
    artist: '讚美之泉',
    category: '國語',
    youtube_id: 'mN4oP5qR6sT',
    duration: '4:45',
    lyrics: '我愛你 我深深愛你|我的生命 我的所有 都屬於你|我愛你 我深深愛你|願你心意 成全在我生命|讓我今天 為你而活|讓我今天 為你使用|讓我今天 彰顯你榮耀|讓我今天 更深愛你'
  },
  {
    title: '永恆的讚美',
    artist: 'ACM',
    category: '粵語',
    youtube_id: 'uV7wX8yZ9aB',
    duration: '4:50',
    lyrics: '讚美主 從日出到日落|讚美主 從今時到永遠|我的心 要稱頌耶和華|凡在我裡面的 也要稱頌他的聖名|你以恩典為年歲的冠冕|你的路徑都滴下脂油|我要一生一世讚美你|我要永永遠遠歌頌你'
  },
  {
    title: '榮耀神羔羊',
    artist: '玻璃海',
    category: '粵語',
    youtube_id: 'cD1eF2gH3iJ',
    duration: '5:30',
    lyrics: '榮耀 榮耀 榮耀神羔羊|尊貴 尊貴 尊貴神羔羊|曾被殺的羔羊 是配得頌讚|坐在寶座上 萬國敬拜你|天使天軍齊聲讚美|聖哉聖哉聖哉 全能神|昔在今在以後永在|榮耀歸與羔羊'
  },
  {
    title: '陪我走過春夏秋冬',
    artist: '角聲使團',
    category: '粵語',
    youtube_id: 'kL4mN5oP6qR',
    duration: '4:55',
    lyrics: '陪我走過春夏秋冬 你是我永遠的依靠|在我軟弱的時候 你賜我力量|在我迷茫的時候 你引導我方向|你的愛永不改變 你的恩典夠我用|陪我走過春夏秋冬 直到見你面'
  },
  {
    title: '每一天',
    artist: '角聲使團',
    category: '粵語',
    youtube_id: 'sT7uV8wX9yZ',
    duration: '4:20',
    lyrics: '每一天所度過的每一刻 我得著能力勝過試煉|我倚靠天父智慧的供應 我不用擔心未來的一切|你的信實極其廣大 你的憐憫每天早晨都是新的|我要歌唱你的慈愛 直到永遠'
  },
  {
    title: '獻上頌讚',
    artist: 'ACM',
    category: '粵語',
    youtube_id: 'aB1cD2eF3gH',
    duration: '4:15',
    lyrics: '獻上頌讚 歸與至高神|齊來讚美 歌頌你聖名|你配得一切榮耀 尊貴和讚美|願全地都來向你下拜|哈利路亞 哈利路亞|願天歡喜 願地快樂|哈利路亞 哈利路亞|願萬民都說阿們'
  }
];

async function run() {
  const db = await initDb();

  // 清空再入
  db.run('DELETE FROM hymns');

  const stmt = db.prepare('INSERT INTO hymns (title, artist, category, youtube_id, duration, lyrics) VALUES (?, ?, ?, ?, ?, ?)');

  for (const h of hymns) {
    stmt.run([h.title, h.artist, h.category, h.youtube_id, h.duration, h.lyrics]);
  }

  saveDb();
  console.log(`✅ 已成功匯入 ${hymns.length} 首詩歌`);

  // Show
  const result = db.exec('SELECT id, title, artist, category FROM hymns');
  console.log('📋 詩歌列表：');
  for (const row of result[0].values) {
    console.log(`   ${row[0]}. ${row[1]} - ${row[2]} (${row[3]})`);
  }
}

run().catch(err => console.error('❌ Error:', err));
