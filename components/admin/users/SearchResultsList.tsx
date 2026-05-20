import React from 'react';
import { View, Text } from 'react-native';
import UserCard from './UserCard';
import { styles } from './_styles';

type Props = {
  filteredUsers: any[];
  searchQuery: string;
  totalUsersCount: number;
  paidUsers: Record<string, boolean>;
  roleLabelFor: (role: string) => string;
  searchResultsLabel: string; // t('admin.searchResults')
  usersLabel: string; // t('admin.users')
  paidLabel: string; // t('admin.paid')
  paySubscriptionLabel: string; // t('admin.paySubscriptionIQD')
  noResultsLabel: string; // t('common.noResults')
  onOpenUser: (user: any) => void;
  onDeleteUser: (user: any) => void;
  onMarkPaid: (user: any) => void;
  avatars?: Record<string, string>;
  onPreviewAvatar?: (url?: string | null) => void;
};

// The conditional users list shown when search/filter is active.
export default function SearchResultsList({
  filteredUsers,
  searchQuery,
  totalUsersCount,
  paidUsers,
  roleLabelFor,
  searchResultsLabel,
  usersLabel,
  paidLabel,
  paySubscriptionLabel,
  noResultsLabel,
  onOpenUser,
  onDeleteUser,
  onMarkPaid,
  avatars,
  onPreviewAvatar,
}: Props) {
  if (filteredUsers.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {searchQuery.trim()
          ? `${searchResultsLabel} (${filteredUsers.length})`
          : `${usersLabel} (${totalUsersCount})`}
      </Text>
      {filteredUsers.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          roleLabel={roleLabelFor(user.role)}
          isPaid={!!paidUsers[user.id]}
          paidLabel={paidLabel}
          paySubscriptionLabel={paySubscriptionLabel}
          onPress={() => onOpenUser(user)}
          onDelete={() => onDeleteUser(user)}
          onMarkPaid={() => onMarkPaid(user)}
          avatarUrl={avatars?.[user.id]}
          onPreviewAvatar={onPreviewAvatar}
        />
      ))}
      {filteredUsers.length === 0 && <Text style={styles.emptyText}>{noResultsLabel}</Text>}
    </View>
  );
}
