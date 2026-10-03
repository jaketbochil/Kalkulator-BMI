import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

/* =========================================================
   APLIKASI BMI & PEMANTAU JARAK TEMPUH  (SINGLE SCREEN)
   SMK Krian 1 Sidoarjo - Rekayasa Perangkat Lunak
   Expo React Native - Tema Pink
   ========================================================= */
const PINK = {
  bg: '#FFF1F5',
  card: '#FFFFFF',
  primary: '#E5457F',
  primaryDark: '#B22A5C',
  soft: '#FFD9E6',
  softer: '#FFE9F0',
  text: '#3D2430',
  muted: '#9B7A87',
  border: '#FBC6D8',
};

/* ---------- Fungsi bantu: jarak antar 2 koordinat (Haversine) ---------- */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radius bumi (meter)
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    #map { background: #f3f4f6; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const defaultCenter = [-7.4478, 112.7183];
    const map = L.map('map', { zoomControl: true }).setView(defaultCenter, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let marker = null;
    let line = L.polyline([], { color: '#E5457F', weight: 5 }).addTo(map);

    function updateMap(lat, lon, points, follow) {
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      const pos = [lat, lon];
      if (!marker) {
        marker = L.marker(pos).addTo(map).bindPopup('Lokasi kamu');
      } else {
        marker.setLatLng(pos);
      }
      const coords = (points || []).map(p => [p.latitude, p.longitude]);
      if (coords.length) line.setLatLngs(coords);
      if (follow) map.setView(pos, Math.max(map.getZoom(), 17));
    }

    function setRoute(points) {
      const coords = (points || []).map(p => [p.latitude, p.longitude]);
      line.setLatLngs(coords);
      if (coords.length > 1) map.fitBounds(line.getBounds(), { padding: [20, 20] });
    }

    window.updateMap = updateMap;
    window.setRoute = setRoute;
  </script>
</body>
</html>`;

export default function App() {
  /* ===================== STATE BAGIAN BMI ===================== */
  const [gender, setGender] = useState('pria');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bmiResult, setBmiResult] = useState(null);

  /* ================ STATE BAGIAN PEMANTAU JARAK ================ */
  const [isTracking, setIsTracking] = useState(false);
  const [distance, setDistance] = useState(0); // meter
  const [duration, setDuration] = useState(0); // detik
  const [calories, setCalories] = useState(0); // kkal
  const [targetCalories, setTargetCalories] = useState('300'); // target kalori aktivitas
  const [routePoints, setRoutePoints] = useState([]); // jejak GPS
  const [currentLocation, setCurrentLocation] = useState(null); // lokasi terakhir

  const watcher = useRef(null);
  const mapRef = useRef(null);
  const timer = useRef(null);
  const lastPoint = useRef(null);

  /* ===================== LOGIKA BMI ===================== */
  const hitungBMI = () => {
    const w = parseFloat(String(weight).replace(',', '.'));
    const hCm = parseFloat(String(height).replace(',', '.'));
    const a = parseInt(age, 10);

    if (!a || a < 1 || a > 120) {
      Alert.alert('Usia belum benar', 'Isi usia antara 1 sampai 120 tahun.');
      return;
    }
    if (!w || w <= 0 || !hCm || hCm <= 0) {
      Alert.alert('Data belum lengkap', 'Isi berat badan (kg) dan tinggi badan (cm).');
      return;
    }

    const hM = hCm / 100;
    const bmi = w / (hM * hM); // rumus BMI

    let kategori, warna, ikon, saran;
    if (bmi < 18.5) {
      kategori = 'Kurus';
      warna = '#3B82F6';
      ikon = 'emoticon-sad-outline';
      saran = 'Tambah asupan kalori bergizi dan latihan kekuatan.';
    } else if (bmi < 25) {
      kategori = 'Normal';
      warna = '#16A34A';
      ikon = 'emoticon-happy-outline';
      saran = 'Pertahankan pola makan dan olahraga rutin.';
    } else if (bmi < 30) {
      kategori = 'Gemuk';
      warna = '#F59E0B';
      ikon = 'emoticon-neutral-outline';
      saran = 'Kurangi gula dan gorengan, tambah aktivitas fisik.';
    } else {
      kategori = 'Obesitas';
      warna = '#DC2626';
      ikon = 'emoticon-frown-outline';
      saran = 'Atur pola makan dan konsultasikan ke tenaga kesehatan.';
    }

    // Rentang berat badan ideal berdasarkan BMI 18.5 - 24.9
    const idealMin = 18.5 * hM * hM;
    const idealMax = 24.9 * hM * hM;
    let selisih;
    if (w < idealMin) selisih = `Perlu menambah ${(idealMin - w).toFixed(1)} kg.`;
    else if (w > idealMax) selisih = `Perlu menurunkan ${(w - idealMax).toFixed(1)} kg.`;
    else selisih = 'Berat badan sudah berada di rentang ideal.';

    setBmiResult({
      bmi: bmi.toFixed(1),
      kategori,
      warna,
      ikon,
      saran,
      idealMin: idealMin.toFixed(1),
      idealMax: idealMax.toFixed(1),
      selisih,
    });
  };

  const resetBMI = () => {
    setAge('');
    setWeight('');
    setHeight('');
    setBmiResult(null);
  };

  /* ================ LOGIKA PEMANTAU JARAK TEMPUH ================ */
  const mulaiTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Izin lokasi ditolak', 'Aktifkan izin lokasi untuk memantau jarak tempuh.');
      return;
    }

    setIsTracking(true);
    lastPoint.current = null;

    timer.current = setInterval(() => setDuration((d) => d + 1), 1000);

    watcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (loc) => {
        const { latitude, longitude, accuracy } = loc.coords;
        if (accuracy && accuracy > 30) return; // buang sinyal GPS yang buruk

        const point = { latitude, longitude };
        setCurrentLocation(point);
        setRoutePoints((prev) => {
          if (prev.length === 0) return [point];
          const last = prev[prev.length - 1];
          const moved = haversine(last.latitude, last.longitude, latitude, longitude);
          return moved >= 1 ? [...prev, point] : prev;
        });

        if (lastPoint.current) {
          const d = haversine(
            lastPoint.current.latitude,
            lastPoint.current.longitude,
            latitude,
            longitude
          );
          if (d > 1 && d < 100) setDistance((prev) => prev + d); // saring lompatan GPS
        }
        lastPoint.current = { latitude, longitude };
      }
    );
  };

  const berhentiTracking = () => {
    setIsTracking(false);
    if (watcher.current) {
      watcher.current.remove();
      watcher.current = null;
    }
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const resetTracking = () => {
    berhentiTracking();
    setDistance(0);
    setDuration(0);
    setCalories(0);
    setRoutePoints([]);
    setCurrentLocation(null);
    lastPoint.current = null;
  };

  // Hitung kalori: MET x berat badan (kg) x durasi (jam)
  useEffect(() => {
    const w = parseFloat(String(weight).replace(',', '.')) || 60; // default 60 kg
    const jam = duration / 3600;
    const kmh = jam > 0 ? distance / 1000 / jam : 0;

    let met = 2.0;
    if (kmh >= 12) met = 11.5;
    else if (kmh >= 9) met = 9.8;
    else if (kmh >= 6.5) met = 7.0;
    else if (kmh >= 4.5) met = 4.3;
    else if (kmh >= 2) met = 2.8;

    setCalories(met * w * jam);
  }, [distance, duration, weight]);

  // Kirim lokasi dan jejak GPS ke peta OpenStreetMap
  useEffect(() => {
    if (!mapRef.current || !currentLocation) return;
    const payload = JSON.stringify(routePoints).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const js = `window.updateMap(${currentLocation.latitude}, ${currentLocation.longitude}, ${payload}, ${isTracking}); true;`;
    mapRef.current.injectJavaScript(js);
  }, [currentLocation, routePoints, isTracking]);

  // Bersihkan sensor & timer saat komponen ditutup
  useEffect(() => {
    return () => {
      if (watcher.current) watcher.current.remove();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const km = distance / 1000;
  const jam = duration / 3600;
  const kecepatan = jam > 0 ? km / jam : 0;
  const pace = km > 0 ? duration / 60 / km : 0; // menit per km
  const target = parseFloat(String(targetCalories).replace(',', '.')) || 0;
  const calorieProgress = target > 0 ? Math.min((calories / target) * 100, 100) : 0;
  const targetReached = target > 0 && calories >= target;

  const bukaNavigasi = () => {
    if (!currentLocation) {
      Alert.alert('Lokasi belum tersedia', 'Tekan Mulai dan izinkan akses lokasi terlebih dahulu.');
      return;
    }

    const { latitude, longitude } = currentLocation;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  /* ========================= TAMPILAN ========================= */
  return (
    <View style={styles.safe}>
  <StatusBar barStyle="light-content" backgroundColor={PINK.primary} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------- HEADER ---------------- */}
        <View style={styles.header}>
          <MaterialCommunityIcons name="heart-pulse" size={30} color="#FFFFFF" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitle}>PinkFit</Text>
            <Text style={styles.headerSub}>BMI & pemantau jarak tempuh</Text>
          </View>
        </View>

        {/* ============ BAGIAN 1 : KALKULATOR BMI ============ */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.iconCircle}>
              <FontAwesome5 name="weight" size={16} color={PINK.primary} />
            </View>
            <Text style={styles.cardTitle}>Kalkulator BMI</Text>
          </View>

          <Text style={styles.label}>Jenis kelamin</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.genderBox, gender === 'pria' && styles.genderActive]}
              onPress={() => setGender('pria')}
            >
              <Ionicons
                name="male"
                size={22}
                color={gender === 'pria' ? '#FFFFFF' : PINK.primary}
              />
              <Text style={[styles.genderText, gender === 'pria' && styles.genderTextActive]}>
                Laki-laki
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.genderBox, gender === 'wanita' && styles.genderActive]}
              onPress={() => setGender('wanita')}
            >
              <Ionicons
                name="female"
                size={22}
                color={gender === 'wanita' ? '#FFFFFF' : PINK.primary}
              />
              <Text style={[styles.genderText, gender === 'wanita' && styles.genderTextActive]}>
                Perempuan
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Usia (tahun)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="contoh: 17"
            placeholderTextColor={PINK.muted}
            value={age}
            onChangeText={setAge}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Berat badan (kg)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="contoh: 55"
                placeholderTextColor={PINK.muted}
                value={weight}
                onChangeText={setWeight}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Tinggi badan (cm)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="contoh: 165"
                placeholderTextColor={PINK.muted}
                value={height}
                onChangeText={setHeight}
              />
            </View>
          </View>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={hitungBMI}>
              <Ionicons name="calculator-outline" size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Hitung BMI</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={resetBMI}>
              <Ionicons name="refresh" size={18} color={PINK.primary} />
              <Text style={styles.btnGhostText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {bmiResult && (
            <View style={styles.result}>
              <MaterialCommunityIcons name={bmiResult.ikon} size={46} color={bmiResult.warna} />
              <Text style={styles.bmiValue}>{bmiResult.bmi}</Text>
              <View style={[styles.badge, { backgroundColor: bmiResult.warna }]}>
                <Text style={styles.badgeText}>{bmiResult.kategori}</Text>
              </View>

              <Text style={styles.resultLine}>
                Berat ideal untuk tinggi {height} cm: {bmiResult.idealMin} – {bmiResult.idealMax} kg
              </Text>
              <Text style={styles.resultStrong}>{bmiResult.selisih}</Text>
              <Text style={styles.resultNote}>{bmiResult.saran}</Text>
              <Text style={styles.resultNote}>
                Data: {gender === 'pria' ? 'Laki-laki' : 'Perempuan'}, {age} tahun
              </Text>
            </View>
          )}
        </View>

        {/* ======= BAGIAN 2 : PEMANTAU JARAK TEMPUH (GPS) ======= */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="run-fast" size={18} color={PINK.primary} />
            </View>
            <Text style={styles.cardTitle}>Pemantau jarak tempuh</Text>
          </View>

          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: isTracking ? '#16A34A' : PINK.border }]} />
            <Text style={styles.statusText}>
              {isTracking ? 'Sensor lokasi aktif, sedang merekam' : 'Belum merekam'}
            </Text>
          </View>

          <View style={styles.mainStat}>
            <MaterialCommunityIcons name="map-marker-distance" size={26} color={PINK.primary} />
            <Text style={styles.distanceValue}>{km.toFixed(2)}</Text>
            <Text style={styles.distanceUnit}>km</Text>
          </View>

          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Ionicons name="time-outline" size={20} color={PINK.primary} />
              <Text style={styles.statValue}>{formatDuration(duration)}</Text>
              <Text style={styles.statLabel}>Durasi</Text>
            </View>
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="fire" size={20} color={PINK.primary} />
              <Text style={styles.statValue}>{calories.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Kalori (kkal)</Text>
            </View>
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="speedometer" size={20} color={PINK.primary} />
              <Text style={styles.statValue}>{kecepatan.toFixed(1)}</Text>
              <Text style={styles.statLabel}>km/jam</Text>
            </View>
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="shoe-print" size={20} color={PINK.primary} />
              <Text style={styles.statValue}>{pace > 0 ? pace.toFixed(1) : '0.0'}</Text>
              <Text style={styles.statLabel}>menit/km</Text>
            </View>
          </View>

          {/* ============ TARGET KALORI AKTIVITAS ============ */}
          <View style={styles.targetBox}>
            <View style={styles.targetHead}>
              <View style={styles.targetTitleRow}>
                <MaterialCommunityIcons name="target" size={20} color={PINK.primary} />
                <Text style={styles.targetTitle}>Target kalori aktivitas</Text>
              </View>
              <TextInput
                style={styles.targetInput}
                keyboardType="numeric"
                value={targetCalories}
                onChangeText={setTargetCalories}
                placeholder="300"
                placeholderTextColor={PINK.muted}
              />
              <Text style={styles.targetUnit}>kkal</Text>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${calorieProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {calories.toFixed(0)} / {target > 0 ? target.toFixed(0) : '0'} kkal
              {targetReached ? ' · Target tercapai!' : ''}
            </Text>
          </View>

          {/* ============ PETA & NAVIGASI ============ */}
          <View style={styles.mapCard}>
            <View style={styles.cardHead}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color={PINK.primary} />
              </View>
              <Text style={styles.cardTitle}>Peta & navigasi</Text>
            </View>

            <WebView
              ref={mapRef}
              originWhitelist={['*']}
              source={{ html: MAP_HTML }}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              onLoadEnd={() => {
                if (!currentLocation) return;
                const payload = JSON.stringify(routePoints);
                mapRef.current?.injectJavaScript(
                  `window.updateMap(${currentLocation.latitude}, ${currentLocation.longitude}, ${payload}, ${isTracking}); true;`
                );
              }}
              style={styles.map}
            />

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, !currentLocation && styles.btnDisabled]}
              onPress={bukaNavigasi}
              disabled={!currentLocation}
            >
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Buka Google Maps</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Peta menampilkan lokasi dan jejak GPS selama tracking. Tombol navigasi membuka
              Google Maps berdasarkan lokasi saat ini.
            </Text>
          </View>

          <View style={styles.row}>
            {!isTracking ? (
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={mulaiTracking}>
                <Ionicons name="play" size={18} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Mulai</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={berhentiTracking}>
                <Ionicons name="stop" size={18} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Berhenti</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={resetTracking}>
              <Ionicons name="refresh" size={18} color={PINK.primary} />
              <Text style={styles.btnGhostText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Kalori dihitung dari berat badan pada kalkulator BMI. Isi berat badan dulu agar
            hasilnya akurat. Rekam di luar ruangan supaya sinyal GPS stabil.
          </Text>
        </View>

        <Text style={styles.footer}>SMK Krian 1 Sidoarjo · Rekayasa Perangkat Lunak</Text>
        </ScrollView>
  </View>
);
}

/* ========================= STYLE ========================= */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PINK.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scroll: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PINK.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  headerSub: { color: '#FFD9E6', fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: PINK.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PINK.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PINK.softer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: PINK.text },

  label: { fontSize: 13, color: PINK.muted, marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: PINK.border,
    backgroundColor: PINK.softer,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: PINK.text,
  },

  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  half: { flex: 1 },

  genderBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PINK.border,
    backgroundColor: PINK.softer,
  },
  genderActive: { backgroundColor: PINK.primary, borderColor: PINK.primary },
  genderText: { color: PINK.primary, fontWeight: '600' },
  genderTextActive: { color: '#FFFFFF' },

  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 12,
  },
  btnPrimary: { backgroundColor: PINK.primary },
  btnStop: { backgroundColor: PINK.primaryDark },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '700' },
  btnGhost: { backgroundColor: PINK.soft },
  btnGhostText: { color: PINK.primary, fontWeight: '700' },

  result: {
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: PINK.border,
  },
  bmiValue: { fontSize: 44, fontWeight: '800', color: PINK.text, marginTop: 4 },
  badge: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20, marginTop: 6 },
  badgeText: { color: '#FFFFFF', fontWeight: '700' },
  resultLine: { marginTop: 12, color: PINK.text, textAlign: 'center' },
  resultStrong: { marginTop: 4, color: PINK.primary, fontWeight: '700', textAlign: 'center' },
  resultNote: { marginTop: 6, fontSize: 12, color: PINK.muted, textAlign: 'center' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 12, color: PINK.muted },

  mainStat: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginVertical: 12 },
  distanceValue: { fontSize: 50, fontWeight: '800', color: PINK.primary, marginLeft: 8 },
  distanceUnit: { fontSize: 18, color: PINK.muted, marginBottom: 9, marginLeft: 6 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: {
    width: '47.5%',
    alignItems: 'center',
    backgroundColor: PINK.softer,
    borderRadius: 14,
    paddingVertical: 14,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: PINK.text, marginTop: 4 },
  statLabel: { fontSize: 11, color: PINK.muted, marginTop: 2 },

  targetBox: {
    marginTop: 14,
    padding: 14,
    backgroundColor: PINK.softer,
    borderRadius: 14,
  },
  targetHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  targetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 7,
  },
  targetTitle: { color: PINK.text, fontWeight: '700' },
  targetInput: {
    width: 70,
    borderWidth: 1,
    borderColor: PINK.border,
    backgroundColor: PINK.card,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: 'center',
    color: PINK.text,
  },
  targetUnit: { marginLeft: 6, fontSize: 12, color: PINK.muted },
  progressTrack: {
    height: 9,
    backgroundColor: PINK.card,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: PINK.primary,
    borderRadius: 10,
  },
  progressText: {
    fontSize: 11,
    color: PINK.muted,
    marginTop: 6,
    textAlign: 'right',
  },
  mapCard: {
    marginTop: 14,
    padding: 14,
    backgroundColor: PINK.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PINK.border,
  },
  map: {
    height: 260,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  btnDisabled: { opacity: 0.55 },
  hint: { fontSize: 11, color: PINK.muted, marginTop: 12, lineHeight: 16 },
  footer: { textAlign: 'center', fontSize: 11, color: PINK.muted, marginTop: 4 },
});