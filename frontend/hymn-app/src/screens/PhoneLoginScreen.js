// 電話+密碼登入 —— PHONE-PASSWORD-AUTH-PLAN §5.2。
// 預設係登入版面(電話+密碼);「新用戶?註冊」同「忘記密碼?」入面共用
// 「①電話→②OTP碼」兩步(同舊 OTP-only 版面一樣嘅 UI),分流之後:
//   註冊:③一版過填 密碼×2 + 姓名 + 性別 + 出生年份 → register-phone
//   忘記密碼:③新密碼×2(仲未有姓名/性別/年份先一併問)→ reset-password
// ⚠️ 由 PHONE_AUTH_ENABLED flag 控制係咪顯示。個 flag 2026-08-02 上線起一直係
// `true`(THIRD-PASS-REVIEW P3 修正:呢度舊註解讀落好似仲未開),即係呢版而家
// 就係登入頁嘅預設;flag 改返 false 先至會唔 render。
// 主通道 WhatsApp/SMS 由 backend 決定,前端唔理;+86 backend 回 cn_unsupported,
// 呢度顯示「用電郵」提示。

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import LogoRing from '../components/LogoRing';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { useInsets } from '../hooks/useInsets';
import VersionTag from '../components/VersionTag';

const CURRENT_YEAR = new Date().getFullYear();

// BATCH5 O11:搬出 module scope(以前每次 PhoneLoginScreen render 都會喺
// component body 重新定義呢個 component,揀完性別會跳一 tick)。styles 係
// module-level StyleSheet,搬出去照用到。
function GenderChips({ gender, onSelect }) {
  return (
    <View style={styles.chipRow}>
      {[{ v: 'male', l: '男' }, { v: 'female', l: '女' }].map((g) => (
        <TouchableOpacity
          key={g.v}
          style={[styles.chip, gender === g.v && styles.chipActive]}
          onPress={() => onSelect(g.v)}
          activeOpacity={0.75}
        >
          <Text style={[styles.chipText, gender === g.v && styles.chipTextActive]}>{g.l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PhoneLoginScreen({ onClose, onUseEmail }) {
  const { requestOtp, verifyOtpTicket, registerPhone, loginPhone, resetPassword, fetchOtpStatus, checkInviteCode } = useAuth();
  const insets = useInsets();

  // screen:'login' 係預設;'invite' 淨係 register 喺 invite mode 先有嘅⓪步
  // (MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.7/§3.3);'phone'/'code' 俾
  // register 同 forgot 共用(靠 flow 分邊個),'profile' 淨係 register 尾步,
  // 'newpass' 淨係 forgot 尾步。
  const [screen, setScreen] = useState('login');
  const [flow, setFlow] = useState(null); // 'register' | 'forgot' | null

  const [phone, setPhone] = useState('+852');
  const [password, setPassword] = useState(''); // 登入用
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState(null);
  const [profileComplete, setProfileComplete] = useState(false);

  // registrationMode(§2.4)—— mount 就攞,唔等用戶撳「註冊」先問(避免嗰刻
  // 等 network)。null=未攞到,fail-closed 當要顯示⓪步(同 backend 冇設 env
  // 就當 invite 一致嘅審慎取態);攞唔到都當要顯示,寧多一步唔少一步。
  const [registrationMode, setRegistrationMode] = useState(null);
  const [inviteCode, setInviteCode] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchOtpStatus().then((d) => { if (!cancelled) setRegistrationMode(d?.registrationMode === 'open' ? 'open' : 'invite'); })
      .catch(() => { if (!cancelled) setRegistrationMode('invite'); });
    return () => { cancelled = true; };
  }, [fetchOtpStatus]);

  // 註冊 ③ / 忘記密碼 ③ 共用嘅欄
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState(null); // 'male' | 'female'
  const [birthYear, setBirthYear] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 'code' 步撞到「flow 揀錯咗」嗰下(register 撞已註冊 / forgot 撞未註冊),
  // 用專門 flag 記低嚟決定顯唔顯示捷徑掣,唔靠 err 文字比對(脆弱)。
  const [errKind, setErrKind] = useState(null); // 'already_registered' | 'no_account' | null
  const [cooldown, setCooldown] = useState(0);
  const [focused, setFocused] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCooldown = useCallback(() => {
    // BATCH5 O11:重發驗證碼連撳兩下以前會漏一條 interval(舊 timer 唔 clear
    // 就開新嘅),cooldown 倒數會亂。
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(60);
    timerRef.current = setInterval(() => {
      setCooldown((c) => { if (c <= 1) { clearInterval(timerRef.current); return 0; } return c - 1; });
    }, 1000);
  }, []);

  const resetStepState = () => { setErr(''); setErrKind(null); setCode(''); setTicket(null); setProfileComplete(false); };

  const goLogin = useCallback(() => {
    setScreen('login'); setFlow(null); resetStepState();
  }, []);
  // ⓪步兩個 mode 都顯示(REGISTER-OPTIONAL-INVITE-PLAN §2-F1):invite mode
  // 必填冇跳過掣(一字不改);open mode 變選填,有跳過掣。registrationMode
  // null(仲未攞到)一樣行呢個畫面,fail-closed 當要輸入(同 backend 冇設
  // env 一致嘅取態,§4 case 12)——差別淨係入面顯唔顯示跳過掣。
  const startRegister = useCallback(() => {
    setScreen('invite'); setFlow('register'); resetStepState();
    setInviteCode(''); setNewPassword(''); setConfirmPassword(''); setUsername(''); setGender(null); setBirthYear('');
  }, []);
  const startForgot = useCallback(() => {
    setScreen('phone'); setFlow('forgot'); resetStepState();
    setNewPassword(''); setConfirmPassword(''); setUsername(''); setGender(null); setBirthYear('');
  }, []);

  // ── 登入(電話+密碼)──────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setErr('');
    if (!phone.trim() || !password) { setErr('請輸入電話同密碼'); return; }
    setBusy(true);
    try {
      await loginPhone(phone.trim(), password);
      onClose && onClose();
    } catch (e) { setErr(e.message || '登入失敗'); }
    finally { setBusy(false); }
  }, [phone, password, loginPhone, onClose]);

  // ── ⓪邀請碼(register only,§2.7/§3.3;open mode 選填——§2-F1)────────
  // 撞 invite_used/invite_invalid 由③跳返⓪嗰陣(§4 case 6/9),ticket 仲有效
  // (未過期,只係個邀請碼冇用得)——呢種情況重過⓪就應該直接跳去③,唔使
  // 再發多次 OTP 燒 quota(opus-verify local_a1403205 P2)。
  const handleCheckInvite = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      const valid = await checkInviteCode(inviteCode);
      if (!valid) { setErr('邀請碼唔啱,請問返邀請你嗰位朋友'); return; }
      setScreen(ticket && flow === 'register' ? 'profile' : 'phone');
    } catch (e) { setErr(e.message || '檢查失敗,請再試'); }
    finally { setBusy(false); }
  }, [inviteCode, checkInviteCode, ticket, flow]);

  // open mode 專用嘅跳過掣——清空 inviteCode 直接入①電話步,register-phone
  // 冇送碼一樣開戶成功。同上:ticket 仲喺度就跳返③,唔重發 OTP。
  const handleSkipInvite = useCallback(() => {
    setInviteCode(''); setErr('');
    setScreen(ticket && flow === 'register' ? 'profile' : 'phone');
  }, [ticket, flow]);

  // ── ①電話 → 發驗證碼(register/forgot 共用)──────────────────────
  const handleSendCode = useCallback(async () => {
    setErr(''); setErrKind(null); setBusy(true);
    try {
      await requestOtp(phone.trim());
      setScreen('code');
      startCooldown();
    } catch (e) { setErr(e.message || '發送失敗'); }
    finally { setBusy(false); }
  }, [phone, requestOtp, startCooldown]);

  // ── ②驗證碼 → 換 ticket,按 flow 分流(register/forgot 共用)────────
  const handleVerifyCode = useCallback(async () => {
    setErr(''); setErrKind(null); setBusy(true);
    try {
      const data = await verifyOtpTicket(phone.trim(), code.trim());
      if (flow === 'register') {
        if (data.registered) { setErr('呢個號碼已註冊,請直接登入'); setErrKind('already_registered'); return; }
        setTicket(data.ticket);
        setScreen('profile');
      } else {
        if (!data.registered) { setErr('呢個號碼未註冊,請先註冊'); setErrKind('no_account'); return; }
        setTicket(data.ticket);
        setProfileComplete(!!data.profileComplete);
        setScreen('newpass');
      }
    } catch (e) { setErr(e.message || '驗證失敗'); }
    finally { setBusy(false); }
  }, [phone, code, flow, verifyOtpTicket]);

  const validProfileFields = () => {
    if (!username.trim()) { setErr('請輸入姓名'); return false; }
    if (gender !== 'male' && gender !== 'female') { setErr('請選性別'); return false; }
    const y = Number(birthYear);
    if (!birthYear || !Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) { setErr('請輸入正確嘅出生年份'); return false; }
    return true;
  };

  // ── 註冊 ③:密碼×2 + 姓名 + 性別 + 出生年份 ─────────────────────
  const handleRegisterSubmit = useCallback(async () => {
    setErr('');
    if (newPassword.length < 6) { setErr('密碼最少 6 位'); return; }
    if (newPassword !== confirmPassword) { setErr('兩次密碼唔一致'); return; }
    if (!validProfileFields()) return;
    setBusy(true);
    try {
      await registerPhone({
        ticket, password: newPassword, username: username.trim(), gender, birthYear: Number(birthYear),
        inviteCode: inviteCode || undefined,
      });
      onClose && onClose();
    } catch (e) {
      if (e.code === 'already_registered') setErr('呢個號碼已註冊,請直接登入');
      else if (e.code === 'ticket_expired' || e.code === 'ticket_invalid') { setErr('驗證過期,請重新攞驗證碼'); setScreen('phone'); }
      // §4 case 6/9:碼喺⓪過檢之後先俾第二個人用咗,或者(理論上唔應該)冇碼——
      // 跳返⓪,同 §3.3「跳返⓪」一致(唔淨係錯訊息,重新逼佢核實個碼)。
      else if (e.code === 'invite_used' || e.code === 'invite_invalid' || e.code === 'invite_required') {
        setErr(e.code === 'invite_used' ? '呢個邀請碼啱啱俾人用咗' : '邀請碼唔啱,請問返邀請你嗰位朋友');
        setScreen('invite');
      }
      else setErr(e.message || '註冊失敗');
    } finally { setBusy(false); }
  }, [newPassword, confirmPassword, username, gender, birthYear, ticket, inviteCode, registerPhone, onClose]);

  // ── 忘記密碼 ③:新密碼×2(冇齊 profile 先問埋姓名/性別/年份)──────
  const handleResetSubmit = useCallback(async () => {
    setErr('');
    if (newPassword.length < 6) { setErr('密碼最少 6 位'); return; }
    if (newPassword !== confirmPassword) { setErr('兩次密碼唔一致'); return; }
    let extra = {};
    if (!profileComplete) {
      if (!validProfileFields()) return;
      extra = { username: username.trim(), gender, birthYear: Number(birthYear) };
    }
    setBusy(true);
    try {
      await resetPassword(ticket, newPassword, extra);
      onClose && onClose();
    } catch (e) {
      if (e.code === 'no_account') setErr('呢個號碼未註冊,請先註冊');
      else if (e.code === 'ticket_expired' || e.code === 'ticket_invalid') { setErr('驗證過期,請重新攞驗證碼'); setScreen('phone'); }
      else setErr(e.message || '設定失敗');
    } finally { setBusy(false); }
  }, [newPassword, confirmPassword, profileComplete, username, gender, birthYear, ticket, resetPassword, onClose]);

  const { title, sub } = useMemo(() => {
    if (screen === 'login') return { title: '電話登入', sub: '用電話號碼同密碼登入' };
    if (screen === 'invite') return registrationMode === 'open'
      ? { title: '有冇邀請碼?(選填)', sub: '有邀請碼可以同派碼嗰位自動成為好友;冇都可以直接註冊' }
      : { title: '輸入邀請碼', sub: '而家要有邀請碼先註冊得,問返邀請你嗰位朋友' };
    if (screen === 'phone') return {
      title: flow === 'register' ? '註冊新帳戶' : '忘記密碼',
      sub: '會用 WhatsApp 或短訊寄一個 6 位驗證碼俾你',
    };
    if (screen === 'code') return { title: '輸入驗證碼', sub: `驗證碼已寄去 ${phone}` };
    if (screen === 'profile') return { title: '設定密碼同資料', sub: '一次過設定,之後隨時用電話+密碼登入' };
    if (screen === 'newpass') return { title: '設定新密碼', sub: profileComplete ? '設定新密碼即可' : '順便填埋姓名/性別/出生年份' };
    return { title: '', sub: '' };
  }, [screen, flow, phone, profileComplete, registrationMode]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={[styles.close, { top: insets.top + 8 }]} onPress={onClose}>
        <OdeIcon name="close" size={24} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <LogoRing size={72} style={styles.brandLogoImg} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>

        {screen === 'login' && (
          <>
            <TextInput
              style={[styles.input, focused === 'phone' && styles.inputFocused]} value={phone} onChangeText={setPhone}
              keyboardType="phone-pad" placeholder="+852 1234 5678" placeholderTextColor={COLORS.textSecondary}
              autoComplete="tel" textContentType="telephoneNumber"
              onFocus={() => setFocused('phone')} onBlur={() => setFocused(null)}
            />
            <TextInput
              style={[styles.input, { marginTop: 12 }, focused === 'password' && styles.inputFocused]}
              value={password} onChangeText={setPassword} secureTextEntry
              placeholder="密碼" placeholderTextColor={COLORS.textSecondary}
              autoComplete="password" textContentType="password"
              onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.btnText}>登入</Text>}
            </TouchableOpacity>
            <View style={styles.rowLinks}>
              <TouchableOpacity onPress={startRegister}><Text style={styles.link}>新用戶?註冊</Text></TouchableOpacity>
              <TouchableOpacity onPress={startForgot}><Text style={styles.link}>忘記密碼?</Text></TouchableOpacity>
            </View>
          </>
        )}

        {screen === 'invite' && (
          <>
            <TextInput
              style={[styles.input, styles.codeInput, focused && styles.inputFocused]}
              value={inviteCode}
              // 自動大寫、容忍連字號/空格(§2.7)—— strip 交返俾 backend 嘅
              // normalizeCode 做,呢度淨係大寫化,唔好逼用戶自己刪連字號。
              // 對齊 AddFriendSheet 現成做法:改緊輸入就清走上一次嘅錯誤訊息
              // (Opus 5 驗收 2026-08-04 揪出:之前打字唔會清 err,舊錯誤訊息
              // 一直賴喺度)。
              onChangeText={(t) => { setInviteCode(t.toUpperCase()); setErr(''); }}
              placeholder="K7NM-WP4E" placeholderTextColor={COLORS.border}
              autoCapitalize="characters" autoFocus maxLength={12}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleCheckInvite} disabled={busy || !inviteCode.trim()} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.btnText}>下一步</Text>}
            </TouchableOpacity>
            {registrationMode === 'open' && (
              <TouchableOpacity onPress={handleSkipInvite} disabled={busy} style={{ marginTop: 14 }}>
                <Text style={styles.link}>冇邀請碼,直接註冊</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={goLogin} style={{ marginTop: 14 }}>
              <Text style={styles.link}>返去登入</Text>
            </TouchableOpacity>
          </>
        )}

        {screen === 'phone' && (
          <>
            <TextInput
              style={[styles.input, focused && styles.inputFocused]} value={phone} onChangeText={setPhone}
              keyboardType="phone-pad" placeholder="+852 1234 5678"
              placeholderTextColor={COLORS.textSecondary} autoFocus
              autoComplete="tel" textContentType="telephoneNumber"
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleSendCode} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.btnText}>發送驗證碼</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={goLogin} style={{ marginTop: 14 }}>
              <Text style={styles.link}>返去登入</Text>
            </TouchableOpacity>
          </>
        )}

        {screen === 'code' && (
          <>
            <TextInput
              style={[styles.input, styles.codeInput, focused && styles.inputFocused]} value={code} onChangeText={setCode}
              keyboardType="number-pad" placeholder="______" placeholderTextColor={COLORS.border}
              maxLength={8} autoFocus
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleVerifyCode} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.btnText}>下一步</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={cooldown > 0 ? undefined : handleSendCode} disabled={cooldown > 0} style={{ marginTop: 14 }}>
              <Text style={styles.link}>{cooldown > 0 ? `${cooldown} 秒後可重新發送` : '重新發送驗證碼'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setScreen('phone'); setCode(''); setErr(''); setErrKind(null); }} style={{ marginTop: 10 }}>
              <Text style={styles.link}>改電話號碼</Text>
            </TouchableOpacity>
            {errKind === 'already_registered' && (
              <TouchableOpacity onPress={goLogin} style={{ marginTop: 6 }}>
                <Text style={styles.link}>去登入</Text>
              </TouchableOpacity>
            )}
            {errKind === 'no_account' && (
              <TouchableOpacity onPress={startRegister} style={{ marginTop: 6 }}>
                <Text style={styles.link}>去註冊</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {screen === 'profile' && (
          <>
            <TextInput
              style={[styles.input, focused === 'newPassword' && styles.inputFocused]} value={newPassword} onChangeText={setNewPassword}
              secureTextEntry placeholder="密碼（最少 6 位）" placeholderTextColor={COLORS.textSecondary}
              autoComplete="new-password" textContentType="newPassword"
              onFocus={() => setFocused('newPassword')} onBlur={() => setFocused(null)}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }, focused === 'confirmPassword' && styles.inputFocused]}
              value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry
              placeholder="確認密碼" placeholderTextColor={COLORS.textSecondary}
              autoComplete="new-password" textContentType="newPassword"
              onFocus={() => setFocused('confirmPassword')} onBlur={() => setFocused(null)}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }, focused === 'username' && styles.inputFocused]}
              value={username} onChangeText={setUsername}
              placeholder="姓名" placeholderTextColor={COLORS.textSecondary}
              onFocus={() => setFocused('username')} onBlur={() => setFocused(null)}
            />
            <Text style={styles.fieldLabel}>性別</Text>
            <GenderChips gender={gender} onSelect={setGender} />
            <TextInput
              style={[styles.input, { marginTop: 10 }, focused === 'birthYear' && styles.inputFocused]}
              value={birthYear} onChangeText={(t) => setBirthYear(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="出生年份（例如 1990）" placeholderTextColor={COLORS.textSecondary}
              keyboardType="number-pad" maxLength={4}
              onFocus={() => setFocused('birthYear')} onBlur={() => setFocused(null)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleRegisterSubmit} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.btnText}>完成註冊</Text>}
            </TouchableOpacity>
          </>
        )}

        {screen === 'newpass' && (
          <>
            <TextInput
              style={[styles.input, focused === 'newPassword' && styles.inputFocused]} value={newPassword} onChangeText={setNewPassword}
              secureTextEntry placeholder="新密碼（最少 6 位）" placeholderTextColor={COLORS.textSecondary}
              autoComplete="new-password" textContentType="newPassword"
              onFocus={() => setFocused('newPassword')} onBlur={() => setFocused(null)}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }, focused === 'confirmPassword' && styles.inputFocused]}
              value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry
              placeholder="確認新密碼" placeholderTextColor={COLORS.textSecondary}
              autoComplete="new-password" textContentType="newPassword"
              onFocus={() => setFocused('confirmPassword')} onBlur={() => setFocused(null)}
            />
            {!profileComplete && (
              <>
                <TextInput
                  style={[styles.input, { marginTop: 10 }, focused === 'username' && styles.inputFocused]}
                  value={username} onChangeText={setUsername}
                  placeholder="姓名" placeholderTextColor={COLORS.textSecondary}
                  onFocus={() => setFocused('username')} onBlur={() => setFocused(null)}
                />
                <Text style={styles.fieldLabel}>性別</Text>
                <GenderChips gender={gender} onSelect={setGender} />
                <TextInput
                  style={[styles.input, { marginTop: 10 }, focused === 'birthYear' && styles.inputFocused]}
                  value={birthYear} onChangeText={(t) => setBirthYear(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="出生年份（例如 1990）" placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad" maxLength={4}
                  onFocus={() => setFocused('birthYear')} onBlur={() => setFocused(null)}
                />
              </>
            )}
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleResetSubmit} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.btnText}>完成設定</Text>}
            </TouchableOpacity>
          </>
        )}

        {onUseEmail && screen === 'login' && (
          <TouchableOpacity onPress={onUseEmail} style={{ marginTop: 24 }}>
            <Text style={styles.linkDim}>用電郵/密碼登入</Text>
          </TouchableOpacity>
        )}
        <VersionTag style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  close: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },
  inner: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingVertical: 40 },
  brandLogoImg: { alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  sub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, height: 52, paddingHorizontal: 16,
    color: COLORS.textPrimary, fontSize: 17, borderWidth: 1, borderColor: COLORS.border,
    textAlignVertical: 'center',
  },
  inputFocused: { borderColor: COLORS.primary },
  codeInput: { textAlign: 'center', letterSpacing: 8, fontSize: 24 },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 10, textAlign: 'center' },
  btn: { backgroundColor: COLORS.glow, borderRadius: 26, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  btnText: { color: COLORS.textOnGlow, fontSize: 16, fontWeight: '700' },
  link: { color: COLORS.primary, fontSize: 14, textAlign: 'center', fontWeight: '600', paddingVertical: 10 },
  linkDim: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 10 },
  rowLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row' },
  chip: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border, marginRight: 10,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: COLORS.textOnGlow },
});
