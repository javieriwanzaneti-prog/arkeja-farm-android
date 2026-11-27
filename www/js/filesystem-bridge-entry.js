import { Filesystem, Directory } from '@capacitor/filesystem';

function toBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

window.ArkejaFileSaver = {
  async saveFile(bytes, filename, mimeType='application/octet-stream') {
    const data = toBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const result = await Filesystem.writeFile({
      path: `ARKEJA FARM/${filename}`,
      data,
      directory: Directory.Documents,
      recursive: true
    });
    return { uri: result.uri, location: 'Documents/ARKEJA FARM', mimeType };
  },
  async savePDF(bytes, filename) { return this.saveFile(bytes, filename, 'application/pdf'); }
};
