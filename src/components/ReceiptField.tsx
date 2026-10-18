import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { deleteReceiptImage, storeReceiptImage } from '../lib/database';

export function ReceiptField(props: { uri: string | null; onChange: (uri: string | null) => void }) {
  const [busy, setBusy] = useState(false);

  const chooseImage = async () => {
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) throw new Error('No image was selected.');
      if (asset.fileSize !== undefined && asset.fileSize > 8 * 1024 * 1024) {
        throw new Error('Choose a receipt image smaller than 8 MB.');
      }

      const storedUri = await storeReceiptImage(asset.uri, asset.mimeType);
      const previousUri = props.uri;
      props.onChange(storedUri);
      if (previousUri) {
        try {
          await deleteReceiptImage(previousUri);
        } catch (error) {
          Alert.alert(
            'Receipt selected',
            `The previous image could not be removed: ${error instanceof Error ? error.message : 'unknown file error'}`,
          );
        }
      }
    } catch (error) {
      Alert.alert('Could not attach receipt', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    if (!props.uri) return;
    setBusy(true);
    try {
      await deleteReceiptImage(props.uri);
      props.onChange(null);
    } catch (error) {
      Alert.alert('Could not remove receipt', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Receipt image (optional)</Text>
      {props.uri ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: props.uri }} style={styles.preview} />
          <View style={styles.previewDetails}>
            <Text style={styles.attached}>Saved on this device</Text>
            <Pressable disabled={busy} onPress={removeImage}>
              <Text style={styles.remove}>{busy ? 'Working…' : 'Remove image'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.button} disabled={busy} onPress={chooseImage}>
          <Text style={styles.buttonText}>{busy ? 'Opening photos…' : 'Choose receipt photo'}</Text>
        </Pressable>
      )}
      <Text style={styles.hint}>Images are copied into app storage and remain available offline.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 18 },
  label: { marginBottom: 8, color: '#344740', fontSize: 13, fontWeight: '700' },
  button: { backgroundColor: '#e4f1eb', borderWidth: 1, borderColor: '#cbd8d0', padding: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#1d6b58', fontWeight: '700' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#e3e9e5' },
  previewDetails: { gap: 8 },
  attached: { color: '#52635b', fontSize: 13, fontWeight: '600' },
  remove: { color: '#9c2f2f', fontSize: 13, fontWeight: '700' },
  hint: { marginTop: 7, color: '#66736e', fontSize: 11, lineHeight: 16 },
});
