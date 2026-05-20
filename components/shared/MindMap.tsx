import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

// Defensive coerce — AI may hand us non-strings. Never let a raw object reach <Text>.
function safeLabel(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return v.label || v.name || v.text || '';
  return '';
}

/**
 * MindMap node. Root has children; leaves have children=[].
 */
export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

interface MindMapProps {
  root: MindMapNode;
  accentColor?: string;
}

/**
 * Renders a horizontal tree mind-map. Each level is drawn in a column; branches
 * expand left-to-right. Used in AI lessons to visualize concept hierarchies.
 * Falls back to indented list when the tree is deep or narrow.
 */
export default function MindMap({ root, accentColor = '#7C3AED' }: MindMapProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add('root');
    root.children?.forEach((_, i) => s.add(`root.${i}`));
    return s;
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderNode = (node: MindMapNode | any, level: number, key: string) => {
    if (!node) return null;
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isOpen = expanded.has(key);
    const bgColor = level === 0 ? accentColor : level === 1 ? `${accentColor}20` : '#F8FAFC';
    const fgColor = level === 0 ? '#FFFFFF' : level === 1 ? accentColor : Colors.text;
    const fontWeight = level === 0 ? '900' : level === 1 ? '800' : '600';

    return (
      <View key={key} style={{ marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Indent guide */}
          {level > 0 && (
            <View style={{ width: level * 14, alignItems: 'flex-end' }}>
              <View style={{ width: 10, height: 1, backgroundColor: Colors.border }} />
            </View>
          )}
          <TouchableOpacity
            style={[
              s.nodeBox,
              { backgroundColor: bgColor, borderColor: level === 0 ? accentColor : Colors.border },
            ]}
            onPress={hasChildren ? () => toggle(key) : undefined}
            activeOpacity={hasChildren ? 0.7 : 1}
          >
            {hasChildren && (
              <Ionicons
                name={isOpen ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color={fgColor}
              />
            )}
            <Text style={[s.nodeLabel, { color: fgColor, fontWeight: fontWeight as any }]}>
              {safeLabel(node.label)}
            </Text>
          </TouchableOpacity>
        </View>

        {hasChildren && isOpen && (
          <View style={{ marginTop: 4 }}>
            {node.children!.map((child: any, i: number) =>
              renderNode(child, level + 1, `${key}.${i}`)
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      horizontal={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 6 }}
    >
      {renderNode(root, 0, 'root')}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  nodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 1,
  },
  nodeLabel: {
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
  },
});
