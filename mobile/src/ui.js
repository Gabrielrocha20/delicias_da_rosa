import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, space } from './theme';

export function Text({ style, weight = 'regular', size = 15, color = colors.text, ...props }) {
  return <RNText {...props} style={[{ fontFamily: fonts[weight], fontSize: size, lineHeight: Math.round(size * 1.4), color }, style]} />;
}

/* Pote de bolo: a mesma marca do painel. */
export function BrandMark({ size = 32 }) {
  const s = size / 32;
  return <View style={{ width: size, height: size }}>
    <View style={{ position: 'absolute', left: 5 * s, top: 9 * s, width: 22 * s, height: 20 * s, borderRadius: 5 * s, backgroundColor: colors.accent }} />
    <View style={{ position: 'absolute', left: 4 * s, top: 6 * s, width: 24 * s, height: 5 * s, borderRadius: 2.5 * s, backgroundColor: colors.primary }} />
    <View style={{ position: 'absolute', left: 8 * s, top: 17 * s, width: 16 * s, height: 2 * s, borderRadius: s, backgroundColor: colors.accentSoft }} />
    <View style={{ position: 'absolute', left: 8 * s, top: 22 * s, width: 16 * s, height: 2 * s, borderRadius: s, backgroundColor: colors.accentSoft, opacity: 0.7 }} />
    <View style={{ position: 'absolute', left: 19.4 * s, top: 1 * s, width: 5.2 * s, height: 5.2 * s, borderRadius: 2.6 * s, backgroundColor: colors.accent }} />
  </View>;
}

/* Tela: título grande, uma linha de contexto e o conteúdo numa folha branca. */
export function Screen({ title, subtitle, action, children, refreshing = false, onRefresh, scroll = true }) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top }}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text weight="semibold" size={24}>{title}</Text>
        {!!subtitle && <Text color={colors.muted} size={14} style={{ marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {action}
    </View>
    <Body
      style={styles.sheet}
      contentContainerStyle={scroll ? { padding: space.lg, paddingBottom: 32, gap: space.lg } : undefined}
      keyboardShouldPersistTaps="handled"
      refreshControl={scroll && onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}>
      {children}
    </Body>
  </View>;
}

export function Card({ title, subtitle, right, children, style, padded = true }) {
  return <View style={[styles.card, style]}>
    {(title || right) && <View style={styles.cardHead}>
      <View style={{ flex: 1 }}>
        {!!title && <Text weight="semibold" size={16}>{title}</Text>}
        {!!subtitle && <Text color={colors.muted} size={13}>{subtitle}</Text>}
      </View>
      {right}
    </View>}
    <View style={padded ? { paddingHorizontal: space.lg, paddingBottom: space.lg } : null}>{children}</View>
  </View>;
}

export function Kpis({ items }) {
  return <View style={styles.kpis}>
    {items.map((item, index) => <View key={item.label} style={[styles.kpi, index % 2 === 1 && styles.kpiRight, index > 1 && styles.kpiTop, items.length % 2 === 1 && index === items.length - 1 && { width: '100%' }]}>
      <Text size={13} color={colors.muted}>{item.label}</Text>
      <Text size={index === 0 ? 24 : 20} weight={index === 0 ? 'medium' : 'regular'} color={item.color || colors.text} style={{ marginTop: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>
      {!!item.note && <Text size={12} color={colors.muted} numberOfLines={1}>{item.note}</Text>}
    </View>)}
  </View>;
}

export function Pill({ tone = 'neutral', children }) {
  const [bg, ink] = colors.pill[tone];
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text size={12} weight="medium" color={ink}>{children}</Text></View>;
}

export function Button({ title, onPress, variant = 'secondary', icon, disabled, loading, small, style }) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const fg = primary || danger ? '#fff' : colors.text;
  return <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={title}
    style={({ pressed }) => [styles.button, small && styles.buttonSmall, primary && styles.buttonPrimary, danger && styles.buttonDanger, variant === 'ghost' && styles.buttonGhost, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }, style]}>
    {loading ? <ActivityIndicator color={fg} /> : <>
      {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
      <Text weight="medium" size={small ? 13 : 15} color={fg}>{title}</Text>
    </>}
  </Pressable>;
}

export function Field({ label, hint, children }) {
  return <View style={{ gap: 6 }}>
    <Text size={13} weight="medium" color="#3a3330">{label}</Text>
    {children}
    {!!hint && <Text size={12} color={colors.muted}>{hint}</Text>}
  </View>;
}

export function Input({ style, prefix, ...props }) {
  const [focused, setFocused] = useState(false);
  return <View style={[styles.input, focused && styles.inputFocus, style]}>
    {!!prefix && <Text color={colors.muted} style={{ marginRight: 6 }}>{prefix}</Text>}
    <TextInput placeholderTextColor={colors.faint} {...props} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text, paddingVertical: 0 }} />
  </View>;
}

export function Segmented({ options, value, onChange }) {
  return <View style={styles.segmented}>
    {options.map(([key, label]) => <Pressable key={key} onPress={() => onChange(key)} style={[styles.segment, value === key && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: value === key }}>
      <Text size={13} weight={value === key ? 'medium' : 'regular'} color={value === key ? colors.text : colors.muted} numberOfLines={1}>{label}</Text>
    </Pressable>)}
  </View>;
}

/* Filtro por contagem: chips roláveis com o número dentro. */
export function Chips({ items, value, onChange }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
    {items.map(item => <Pressable key={item.key} onPress={() => onChange(item.key)} style={[styles.chip, value === item.key && styles.chipActive]}>
      <Text size={13} color={value === item.key ? colors.accentInk : colors.muted}>{item.label}</Text>
      <Text size={13} weight="semibold" color={item.alert && item.count ? colors.negative : value === item.key ? colors.accentInk : colors.text}>{item.count}</Text>
    </Pressable>)}
  </ScrollView>;
}

/* Lista de opções em folha: substitui o <select>. */
export function Select({ label, value, options, onChange, placeholder = 'Selecione' }) {
  const [open, setOpen] = useState(false);
  const current = options.find(option => String(option.value) === String(value));
  return <Field label={label}>
    <Pressable onPress={() => setOpen(true)} style={[styles.input, { justifyContent: 'space-between' }]} accessibilityRole="button" accessibilityLabel={label}>
      <Text color={current ? colors.text : colors.faint} numberOfLines={1} style={{ flex: 1 }}>{current?.label || placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.muted} />
    </Pressable>
    <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
      {options.map(option => <Pressable key={String(option.value)} onPress={() => { onChange(option.value); setOpen(false); }} style={styles.option}>
        <View style={{ flex: 1 }}>
          <Text weight={String(option.value) === String(value) ? 'medium' : 'regular'}>{option.label}</Text>
          {!!option.note && <Text size={13} color={colors.muted}>{option.note}</Text>}
        </View>
        {String(option.value) === String(value) && <Ionicons name="checkmark" size={20} color={colors.accent} />}
      </Pressable>)}
    </Sheet>
  </Field>;
}

export function Sheet({ visible, title, subtitle, onClose, children, footer }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheetBox, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text weight="semibold" size={18}>{title}</Text>
            {!!subtitle && <Text size={13} color={colors.muted}>{subtitle}</Text>}
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fechar"><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        {footer && <View style={styles.sheetFoot}>{footer}</View>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function ListRow({ title, subtitle, right, rightSub, onPress, children }) {
  const Wrap = onPress ? Pressable : View;
  const style = onPress ? ({ pressed }) => [styles.row, pressed && { backgroundColor: colors.raised }] : styles.row;
  return <Wrap onPress={onPress} style={style}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text weight="medium" numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text size={13} color={colors.muted} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {(right || rightSub) && <View style={{ alignItems: 'flex-end' }}>
        {typeof right === 'string' ? <Text weight="medium" style={{ fontVariant: ['tabular-nums'] }}>{right}</Text> : right}
        {!!rightSub && <Text size={12} color={colors.muted}>{rightSub}</Text>}
      </View>}
    </View>
    {children}
  </Wrap>;
}

export function Meter({ value, max, tone }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return <View style={styles.meter}><View style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3, backgroundColor: tone === 'low' ? colors.negative : tone === 'accent' ? colors.accent : colors.text }} /></View>;
}

export function Empty({ title, text, action }) {
  return <View style={styles.empty}>
    <Text weight="medium">{title}</Text>
    {!!text && <Text size={14} color={colors.muted}>{text}</Text>}
    {action}
  </View>;
}

export function Notice({ tone = 'info', children }) {
  const tones = { info: [colors.raised, colors.muted], error: colors.pill.negative, warn: ['#fffbeb', '#92400e'], ok: colors.pill.positive };
  const [bg, ink] = tones[tone];
  if (!children) return null;
  return <View style={[styles.notice, { backgroundColor: bg }]}><Text size={14} color={ink}>{children}</Text></View>;
}

export function Loading() {
  return <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
}

/* ---------- Toast ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const show = useCallback((text, tone = 'ok') => {
    setMessage({ text, tone });
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setMessage(null));
  }, [opacity]);
  return <ToastContext.Provider value={show}>
    {children}
    {message && <Animated.View pointerEvents="none" style={[styles.toast, { opacity, bottom: insets.bottom + 72 }]}>
      <Ionicons name={message.tone === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color={message.tone === 'error' ? '#ffb4ab' : '#8fdcb0'} />
      <Text color="#fff" size={14} style={{ flexShrink: 1 }}>{message.text}</Text>
    </Animated.View>}
  </ToastContext.Provider>;
}

/* Carrega dados e recarrega ao voltar para a tela. */
export function useLoader(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const run = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try { setData(await loader()); setError(''); } catch (err) { setError(err.message); } finally { setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, setData, error, refreshing, reload: run, refresh: () => run(true) };
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingTop: 10, paddingBottom: 14 },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingTop: 14, paddingBottom: 10 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surface },
  kpi: { width: '50%', paddingHorizontal: 14, paddingVertical: 12 },
  kpiRight: { borderLeftWidth: 1, borderLeftColor: colors.border },
  kpiTop: { borderTopWidth: 1, borderTopColor: colors.border },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  button: { minHeight: 46, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.control, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonSmall: { minHeight: 36, paddingHorizontal: 12 },
  buttonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.negative, borderColor: colors.negative },
  buttonGhost: { borderColor: 'transparent', backgroundColor: 'transparent' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.control, borderRadius: radius.control, paddingHorizontal: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' },
  inputFocus: { borderColor: colors.accent },
  segmented: { flexDirection: 'row', backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 3, gap: 2 },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 7, paddingHorizontal: 6 },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chip: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.rule },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,21,19,.35)' },
  sheetBox: { marginTop: 'auto', maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: space.lg, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.rule },
  sheetFoot: { flexDirection: 'row', gap: 10, paddingHorizontal: space.lg, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.rule },
  row: { paddingHorizontal: space.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.rule, gap: 8 },
  meter: { height: 5, borderRadius: 3, backgroundColor: colors.rule, overflow: 'hidden' },
  empty: { margin: space.lg, marginTop: 4, padding: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.control, borderRadius: 8, gap: 4 },
  notice: { padding: 12, borderRadius: 8 },
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
