import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme';
import { Empty, Text } from '../ui';

const DOT = { critical: colors.negative, warning: '#c27a12', opportunity: colors.accent, info: colors.faint };

export default function InsightList({ items, limit, onAction }) {
  const rows = limit ? items.slice(0, limit) : items;
  if (!rows.length) return <Empty title="Nenhum alerta agora" text="Estoque, margens e produção estão em ordem." />;
  return <View>{rows.map((item, index) => <Pressable key={`${item.kind}-${index}`} disabled={!item.action} onPress={() => onAction(item.action.route)}
    style={({ pressed }) => [{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.rule }, pressed && { backgroundColor: colors.raised }]}>
    <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: DOT[item.severity] }} />
    <View style={{ flex: 1 }}>
      <Text weight="medium">{item.title}</Text>
      <Text size={13} color={colors.muted}>{item.detail}</Text>
      {item.action && <Text size={13} weight="medium" color={colors.accentInk} style={{ marginTop: 4 }}>{item.action.label}</Text>}
    </View>
    {item.action && <Ionicons name="chevron-forward" size={18} color={colors.faint} style={{ marginTop: 2 }} />}
  </Pressable>)}</View>;
}
