import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';

import {streamChat, buildSleepContext} from '../services/claude';
import {getSleepRecords, getLifestyleLogs} from '../services/database';
import {Colors, Spacing, SharedStyles} from '../theme';
import {ChatMessage} from '../types';

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Pourquoi j\'ai mal dormi cette semaine ?',
  'Quel est mon meilleur pattern de sommeil ?',
  'La caféine impacte-t-elle mon deep sleep ?',
  'Est-ce que le sport le soir me nuit ?',
  'Quels jours ai-je le mieux dormi ce mois ?',
];

// ── Unique ID helper ──────────────────────────────────────────────────────────

let _msgId = 0;
function nextId(): string {
  return String(++_msgId);
}

// ── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({msg}: {msg: ChatMessage}): React.JSX.Element {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && <Text style={styles.avatar}>🤖</Text>}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}>
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}>
          {msg.content}
        </Text>
        <Text style={styles.bubbleTime}>
          {new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChatScreen(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sleepContext, setSleepContext] = useState('');
  const [contextReady, setContextReady] = useState(false);

  const flatRef = useRef<FlatList>(null);
  const streamingMsgId = useRef<string | null>(null);

  // ── Load sleep context ────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [sleepRecords, lifestyleLogs] = await Promise.all([
          getSleepRecords(30),
          getLifestyleLogs(30),
        ]);
        setSleepContext(buildSleepContext(sleepRecords, lifestyleLogs));
        setContextReady(true);
      })();
    }, []),
  );

  // ── Scroll to bottom whenever messages update ─────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({animated: true}), 100);
    }
  }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) {return;}

    setInput('');

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    // Optimistic: placeholder assistant message for streaming
    const assistantId = nextId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages([...newHistory, assistantMsg]);
    streamingMsgId.current = assistantId;
    setStreaming(true);

    try {
      await streamChat(
        [...newHistory, {id: 'q', role: 'user', content: trimmed, timestamp: Date.now()}],
        sleepContext,
        chunk => {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {...m, content: m.content + chunk}
                : m,
            ),
          );
        },
        () => {
          setStreaming(false);
          streamingMsgId.current = null;
        },
      );
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  'Erreur : impossible de contacter le coach IA. Vérifie ta connexion et ta clé API.',
              }
            : m,
        ),
      );
      setStreaming(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={SharedStyles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Coach IA 💬</Text>
          <Text style={styles.headerSub}>
            {contextReady
              ? '30 jours de données chargées'
              : 'Chargement du contexte…'}
          </Text>
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.suggestions}>
            <Text style={styles.suggestTitle}>Questions fréquentes</Text>
            {SUGGESTIONS.map(s => (
              <TouchableOpacity
                key={s}
                style={styles.suggestion}
                onPress={() => sendMessage(s)}
                disabled={!contextReady}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({item}) => <Bubble msg={item} />}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={
              contextReady
                ? 'Pose une question sur ton sommeil…'
                : 'Chargement…'
            }
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            editable={contextReady && !streaming}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || streaming || !contextReady) &&
                styles.sendBtnDisabled,
            ]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || streaming || !contextReady}>
            {streaming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  messageList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    gap: 8,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    fontSize: 22,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTextAssistant: {
    color: Colors.textPrimary,
  },
  bubbleTime: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  suggestions: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  suggestTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  suggestion: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  suggestionText: {
    color: Colors.textPrimary,
    fontSize: 14,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  sendIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
