// 電話 OTP 登入 —— PHONE-AUTH-PLAN。兩步:①輸入號碼 ②輸入 6 位驗證碼。
// ⚠️ 由 PHONE_AUTH_ENABLED flag 控制係咪顯示;flag false 時 AuthScreen 唔會 render 呢個。
// 主通道 WhatsApp/SMS 由 backend 決定,前端唔理;+86 backend 回 cn_unsupported,
// 呢度顯示「用電郵」提示。

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { useInsets } from '../hooks/useInsets';
import VersionTag from '../components/VersionTag';

export default function PhoneLoginScreen({ onClose, onUseEmail }) {
  const { requestOtp, verifyOtp } = useAuth();
  const insets = useInsets();
  const [step, setStep] = useState('phone'); // phone | code
  const [phone, setPhone] = useState('+852');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    timerRef.current = setInterval(() => {
      setCooldown((c) => { if (c <= 1) { clearInterval(timerRef.current); return 0; } return c - 1; });
    }, 1000);
  }, []);

  const send = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      await requestOtp(phone.trim());
      setStep('code'); startCooldown();
    } catch (e) { setErr(e.message || '發送失敗'); }
    finally { setBusy(false); }
  }, [phone, requestOtp, startCooldown]);

  const verify = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      await verifyOtp(phone.trim(), code.trim());
      onClose && onClose();
    } catch (e) { setErr(e.message || '驗證失敗'); }
    finally { setBusy(false); }
  }, [phone, code, verifyOtp, onClose]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={[styles.close, { top: insets.top + 8 }]} onPress={onClose}>
        <MaterialIcons name="close" size={24} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <View style={styles.inner}>
        <Image source={require('../../assets/android-icon-foreground.png')} style={styles.brandLogoImg} />
        <Text style={styles.title}>{step === 'phone' ? '電話登入' : '輸入驗證碼'}</Text>
        <Text style={styles.sub}>
          {step === 'phone' ? '會用 WhatsApp 或短訊寄一個 6 位驗證碼俾你' : `驗證碼已寄去 ${phone}`}
        </Text>

        {step === 'phone' ? (
          <>
            <TextInput
              style={[styles.input, focused && styles.inputFocused]} value={phone} onChangeText={setPhone}
              keyboardType="phone-pad" placeholder="+852 1234 5678"
              placeholderTextColor={COLORS.textSecondary} autoFocus
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={send} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.btnText}>發送驗證碼</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={[styles.input, styles.codeInput, focused && styles.inputFocused]} value={code} onChangeText={setCode}
              keyboardType="number-pad" placeholder="______" placeholderTextColor={COLORS.border}
              maxLength={8} autoFocus
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            />
            {!!err && <Text style={styles.err}>{err}</Text>}
            <TouchableOpacity style={styles.btn} onPress={verify} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.btnText}>登入</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={cooldown > 0 ? undefined : send} disabled={cooldown > 0} style={{ marginTop: 14 }}>
              <Text style={styles.link}>{cooldown > 0 ? `${cooldown} 秒後可重新發送` : '重新發送驗證碼'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('phone'); setCode(''); setErr(''); }} style={{ marginTop: 10 }}>
              <Text style={styles.link}>改電話號碼</Text>
            </TouchableOpacity>
          </>
        )}

        {onUseEmail && (
          <TouchableOpacity onPress={onUseEmail} style={{ marginTop: 24 }}>
            <Text style={styles.linkDim}>用電郵/密碼登入</Text>
          </TouchableOpacity>
        )}
        <VersionTag style={{ marginTop: 20 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  close: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  brandLogoImg: { width: 72, height: 72, alignSelf: 'center', marginBottom: 12, resizeMode: 'contain' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  sub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, height: 52, paddingHorizontal: 16,
    color: COLORS.textPrimary, fontSize: 17, borderWidth: 1, borderColor: COLORS.border,
    textAlignVertical: 'center',
  },
  inputFocused: { borderColor: COLORS.accent },
  codeInput: { textAlign: 'center', letterSpacing: 8, fontSize: 24 },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 10, textAlign: 'center' },
  btn: { backgroundColor: COLORS.accent, borderRadius: 26, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  btnText: { color: COLORS.background, fontSize: 16, fontWeight: '700' },
  link: { color: COLORS.accent, fontSize: 14, textAlign: 'center', fontWeight: '600', paddingVertical: 10 },
  linkDim: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 10 },
});
