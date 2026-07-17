import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image } from 'react-native';
import { useFavorites } from '../context/FavoritesContext';

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

const FavoritesScreen = ({ onPlayHymn }) => {
 const { favorites, toggleFavorite } = useFavorites();

 return (
 <View style={{ flex: 1, backgroundColor: '#0B0F0E', padding: 16 }}>
 <Text style={{ color: '#F5F7F4', fontSize: 24, fontWeight: '700', marginBottom: 16 }}>❤️ 最愛</Text>

 {favorites.length === 0 ? (
 <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
 <Text style={{ color: '#9AA696', fontSize: 16 }}>尚未加入最愛歌曲</Text>
 <Text style={{ color: '#555', fontSize: 14, marginTop: 8 }}>在播放器點擊❤️即可加入</Text>
 </View>
 ) : (
 <FlatList
 data={favorites}
 keyExtractor={item => String(item.id)}
 renderItem={({ item }) => {
 const coverUrl = getCoverUrl(item.youtube_id);
 return (
 <TouchableOpacity onPress={() => onPlayHymn && onPlayHymn(item)} style={{ padding: 12, backgroundColor: '#121A17', marginBottom: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
 {coverUrl ? (
 <Image source={{ uri: coverUrl }} style={{ width: 50, height: 50, borderRadius: 8, marginRight: 12 }} />
 ) : (
 <View style={{ width: 50, height: 50, borderRadius: 8, marginRight: 12, backgroundColor: '#1F2925', justifyContent: 'center', alignItems: 'center' }}>
 <Text style={{ fontSize: 24 }}>🎵</Text>
 </View>
 )}
 <View style={{ flex: 1 }}>
 <Text style={{ color: '#F5F7F4', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
 <Text style={{ color: '#9AA696', fontSize: 14, marginTop: 2 }}>{item.artist || '未知作者'}</Text>
 </View>
 <TouchableOpacity onPress={() => toggleFavorite(item)} style={{ padding: 8 }}>
 <Text style={{ color: '#E8B86D', fontSize: 20 }}>❤️</Text>
 </TouchableOpacity>
 </TouchableOpacity>
 );
 }}
 />
 )}
 </View>
 );
};

export default FavoritesScreen;
