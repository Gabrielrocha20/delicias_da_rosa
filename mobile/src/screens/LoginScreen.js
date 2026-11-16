import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getSession, login } from '../api';
import { colors } from '../theme';
import { BrandMark, Button, Field, Input, Notice, Text } from '../ui';

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const saved = getSession().server.replace(/\/api$/, '');
  const [server, setServer] = useState(saved);
  const [editServer, setEditServer] = useState(!saved);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!server.trim() || !email.trim() || !password) { setError('Preencha servidor, e-mail e senha.'); return; }
    setLoading(true); setError('');
    try { onLogin(await login(server, email.trim().toLowerCase(), password)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.ground }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 32 }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BrandMark size={36} />
          <View><Text weight="semibold" size={17}>Doces Mivi</Text><Text size={13} color={colors.muted}>Fábrica de bolos</Text></View>
        </View>
        <Text weight="semibold" size={26} style={{ marginTop: 18 }}>A fábrica no seu bolso.</Text>
        <Text color={colors.muted}>Vendas, lotes, estoque de insumos e o assistente que avisa o que comprar e o que produzir.</Text>
      </View>
      <View style={{ flex: 1, marginTop: 28, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <Text weight="semibold" size={20}>Entrar</Text>
        <Notice tone="error">{error}</Notice>
        {editServer ? <Field label="Endereço do servidor" hint="O mesmo endereço do painel web, ex.: painel.docesmivi.com.br">
          <Input value={server} onChangeText={setServer} placeholder="painel.seudominio.com.br" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </Field> : <Pressable onPress={() => setEditServer(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="server-outline" size={16} color={colors.muted} />
          <Text size={13} color={colors.muted} style={{ flex: 1 }} numberOfLines={1}>{saved}</Text>
          <Text size={13} weight="medium" color={colors.accentInk}>Trocar</Text>
        </Pressable>}
        <Field label="E-mail"><Input value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" /></Field>
        <Field label="Senha">
          <View>
            <Input value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" style={{ paddingRight: 44 }} />
            <Pressable onPress={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: 13 }} hitSlop={10} accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
            </Pressable>
          </View>
        </Field>
        <Button title="Entrar" variant="primary" onPress={submit} loading={loading} icon="arrow-forward" />
        <Text size={12} color={colors.muted}>Seu login é criado pela administração em Acessos. Vendedores veem as próprias vendas; produtores, os próprios lotes.</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
