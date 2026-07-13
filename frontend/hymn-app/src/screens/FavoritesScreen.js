import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useFavorites } from '../context/FavoritesContext';
import { usePlayer } from '../../App';

const FavoritesScreen = () => {
 const { favorites, toggleFavorite } = useFavorites();
 const { changeToSong } = usePlayer();

 return (
 <View style={{ flex: 1, backgroundColor: '#0B0F0E', padding: 16 }}>
 <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginBottom: 16 }}>❤️ 最愛</Text>

 <FlatList
 data={favorites}
 keyExtractor={item => String(item.id)}
 renderItem={({ item }) => (
 <TouchableOpacity onPress={() => changeToSong(item)} style={{ flexDirection: 'row', padding: 12, backgroundColor: '#121A17', marginBottom: 8, borderRadius: 12 }}>
 <Text style={{ color: '#FFFFFF', flex: 1 }}>{item.title}</Text>
 <TouchableOpacity onPress={() => toggleFavorite(item)}>
 <Text style={{ color: '#E8B86D' }}>❤️</Text>
 </TouchableOpacity>
 </TouchableOpacity>
 )}
 />
 </View>
 );
};

export default FavoritesScreen;
