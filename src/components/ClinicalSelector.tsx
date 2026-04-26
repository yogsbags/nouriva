import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { MagnifyingGlassIcon as MagnifyingGlass, XIcon as X, CheckIcon as Check, PlusIcon as Plus } from 'phosphor-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, AppColors } from '../theme';

export const COMMON_CONDITIONS = [
  // Diabetes & Metabolic
  'Type 1 Diabetes', 'Type 2 Diabetes', 'Gestational Diabetes', 'Pre-diabetes', 'Insulin Resistance', 'Metabolic Syndrome', 'Hypoglycemia',
  // Cardiovascular
  'Hypertension (High BP)', 'Hypotension', 'High Cholesterol', 'Heart Disease', 'Atrial Fibrillation', 'Heart Failure', 'Post-Stroke Recovery',
  // Lifestyle & Weight
  'Obesity', 'Overweight', 'Underweight', 'Bulimia', 'Anorexia', 'Body Dysmorphia', 'Sedentary Lifestyle', 'Marathon Training', 'Bodybuilding',
  // Digestive & Gut
  'IBS (Irritable Bowel)', "IBD (Crohn's)", 'Ulcerative Colitis', 'GERD (Acid Reflux)', 'Celiac Disease', 'Lactose Intolerance', 'Leaky Gut', 'SIBO', 'Gastroparesis',
  // Allergies
  'Peanut Allergy', 'Shellfish Allergy', 'Gluten Sensitivity', 'Dairy Allergy', 'Soy Allergy', 'Egg Allergy', 'Nut Allergy', 'Histamine Intolerance',
  // Inflammatory & Autoimmune
  'Arthritis', 'Rheumatoid Arthritis', 'PCOS', 'Endometriosis', "Hashimoto's", 'Lupus', 'Psoriasis', 'Eczema', 'Chronic Inflammation',
  // Renal & Hepatic
  'CKD Stage 1', 'CKD Stage 2', 'CKD Stage 3', 'CKD Stage 4', 'CKD Stage 5', 'Fatty Liver (NAFLD)', 'Cirrhosis', 'Kidney Stones',
  // Neurological
  'Migraine', 'Epilepsy', 'Multiple Sclerosis', "Parkinson's", 'ADHD', 'Autism Spectrum', "Alzheimer's",
  // Hormonal
  'Hypothyroidism', 'Hyperthyroidism', 'Adrenal Fatigue', 'Menopause', 'Pregnancy', 'Low Testosterone',
  // Respiratory
  'Asthma', 'COPD', 'Sleep Apnea',
  // Diet Specific
  'Keto Diet', 'Veganism', 'Vegetarianism', 'Paleo Diet', 'Intermittent Fasting', 'Low FODMAP', 'Low Histamine',
];

interface ClinicalSelectorProps {
  visible: boolean;
  onClose: () => void;
  selectedConditions: string[];
  onToggleCondition: (condition: string) => void;
}

export default function ClinicalSelector({ visible, onClose, selectedConditions, onToggleCondition }: ClinicalSelectorProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [search, setSearch] = useState('');

  const filtered = (COMMON_CONDITIONS || []).filter((c) => (c || '').toLowerCase().includes((search || '').toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Condition catalog</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color={C.textSecondary} weight="bold" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <MagnifyingGlass size={18} weight="bold" color={C.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search 100+ conditions..."
            placeholderTextColor={C.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
          )}
        </View>

        {selectedConditions.length > 0 && (
          <View style={styles.selectedCount}>
            <Text style={styles.selectedCountText}>
              {selectedConditions.length} condition{selectedConditions.length !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = selectedConditions.includes(item);
            return (
              <TouchableOpacity
                style={[styles.item, isSelected && styles.itemSelected]}
                onPress={() => onToggleCondition(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>{item}</Text>
                {isSelected ? (
                  <Check size={17} color={C.primary} weight="bold" />
                ) : (
                  <Plus size={17} color={C.borderStrong} weight="bold" />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No conditions match "{search}"</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.surface },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    title: { fontSize: 20, fontWeight: '800', color: C.textPrimary },
    closeButton: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center',
    },
    searchContainer: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.bgSecondary, marginHorizontal: 16, marginVertical: 12,
      paddingHorizontal: 14, borderRadius: 14, height: 48,
      borderWidth: 1, borderColor: C.border, gap: 10,
    },
    searchInput: { flex: 1, fontSize: 16, color: C.textPrimary, fontWeight: '500' },
    selectedCount: {
      paddingHorizontal: 20, paddingBottom: 8,
    },
    selectedCountText: { fontSize: 12, fontWeight: '700', color: C.primary },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
    item: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 15, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: C.borderSubtle,
      borderRadius: 4,
    },
    itemSelected: {
      backgroundColor: C.primaryLight,
      borderRadius: 12,
      borderBottomWidth: 0,
      marginVertical: 2,
      paddingHorizontal: 16,
    },
    itemText: { fontSize: 15, color: C.textSecondary, fontWeight: '500' },
    itemTextSelected: { color: C.primary, fontWeight: '700' },
    emptyState: { paddingTop: 40, alignItems: 'center' },
    emptyText: { fontSize: 14, color: C.textTertiary },
  });
}
