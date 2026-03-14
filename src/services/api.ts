import { supabase } from '@/integrations/supabase/client';

export interface Obra {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  status: 'em_andamento' | 'concluida' | 'pausada' | 'cancelada';
  data_inicio?: string;
  data_previsao?: string;
  responsavel_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EapItem {
  id: string;
  obra_id: string;
  parent_id?: string;
  codigo?: string;
  descricao: string;
  pacote?: string;
  lote?: string;
  tipo: 'agrupador' | 'item';
  unidade?: string;
  quantidade?: number;
  predecessoras?: string[];
  sucessoras?: string[];
  avanco_base?: number;
  avanco_previsto?: number;
  avanco_realizado?: number;
  ordem?: number;
  created_at: string;
}

export interface DiarioObra {
  id: string;
  obra_id: string;
  data: string;
  clima: string;
  temperatura_min?: number;
  temperatura_max?: number;
  mao_de_obra: number;
  atividades: string;
  observacoes?: string;
  fotos?: string[];
  created_by: string;
  created_at: string;
}

// === OBRAS ===
export async function fetchObras() {
  const { data, error } = await supabase
    .from('paver_obras')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Obra[];
}

export async function fetchObra(id: string) {
  const { data, error } = await supabase
    .from('paver_obras')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Obra | null;
}

export async function createObra(obra: Omit<Obra, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('paver_obras')
    .insert(obra)
    .select()
    .single();
  if (error) throw error;
  return data as Obra;
}

export async function updateObra(id: string, updates: Partial<Obra>) {
  const { data, error } = await supabase
    .from('paver_obras')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Obra;
}

export async function deleteObra(id: string) {
  const { error } = await supabase.from('paver_obras').delete().eq('id', id);
  if (error) throw error;
}

// === EAP ===
export async function fetchEapItems(obraId: string) {
  const { data, error } = await supabase
    .from('paver_eap_items')
    .select('*')
    .eq('obra_id', obraId)
    .order('ordem', { ascending: true });
  if (error) throw error;
  return data as EapItem[];
}

export async function fetchAllEapItems() {
  const { data, error } = await supabase
    .from('paver_eap_items')
    .select('*')
    .eq('tipo', 'item');
  if (error) throw error;
  return data as EapItem[];
}

export async function insertEapItems(items: Omit<EapItem, 'id' | 'created_at'>[]) {
  const { data, error } = await supabase
    .from('paver_eap_items')
    .insert(items)
    .select();
  if (error) throw error;
  return data as EapItem[];
}

export async function deleteEapItemsByObra(obraId: string) {
  const { error } = await supabase.from('paver_eap_items').delete().eq('obra_id', obraId);
  if (error) throw error;
}

// === DIÁRIO DE OBRA ===
export async function fetchDiarios(obraId: string) {
  const { data, error } = await supabase
    .from('paver_diarios')
    .select('*')
    .eq('obra_id', obraId)
    .order('data', { ascending: false });
  if (error) throw error;
  return data as DiarioObra[];
}

export async function fetchAllDiarios() {
  const { data, error } = await supabase
    .from('paver_diarios')
    .select('*')
    .order('data', { ascending: false });
  if (error) throw error;
  return data as DiarioObra[];
}

export async function fetchDiariosThisMonth() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('paver_diarios')
    .select('*')
    .gte('data', firstDay);
  if (error) throw error;
  return data as DiarioObra[];
}

export async function createDiario(diario: Omit<DiarioObra, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('paver_diarios')
    .insert(diario)
    .select()
    .single();
  if (error) throw error;
  return data as DiarioObra;
}

export async function updateDiario(id: string, updates: Partial<DiarioObra>) {
  const { data, error } = await supabase
    .from('paver_diarios')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DiarioObra;
}

export async function deleteDiario(id: string) {
  const { error } = await supabase.from('paver_diarios').delete().eq('id', id);
  if (error) throw error;
}

// === PROFILES & ROLES (admin) ===
export interface UserWithRole {
  id: string;
  full_name?: string;
  email?: string;
  roles: string[];
}

export async function fetchAllUsers(): Promise<UserWithRole[]> {
  const { data: profiles, error: pErr } = await supabase
    .from('paver_profiles')
    .select('id, full_name');
  if (pErr) throw pErr;

  const { data: roles, error: rErr } = await supabase
    .from('paver_user_roles')
    .select('user_id, role');
  if (rErr) throw rErr;

  return (profiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    roles: (roles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
  }));
}

export async function assignRole(userId: string, role: string) {
  const { error } = await supabase
    .from('paver_user_roles')
    .insert({ user_id: userId, role: role as any });
  if (error) throw error;
}

export async function removeRole(userId: string, role: string) {
  const { error } = await supabase
    .from('paver_user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role);
  if (error) throw error;
}

// === RELATÓRIO FOTOGRÁFICO ===
export interface PlantaObra {
  id: string;
  obra_id: string;
  nome: string;
  imagem_url: string;
  created_at: string;
}

export interface FotoLocalizada {
  id: string;
  planta_id: string;
  obra_id: string;
  foto_url: string;
  descricao?: string;
  pos_x: number;
  pos_y: number;
  created_by: string;
  created_at: string;
}

export async function fetchPlantas(obraId: string) {
  const { data, error } = await supabase
    .from('paver_plantas')
    .select('*')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as PlantaObra[];
}

export async function createPlanta(planta: Omit<PlantaObra, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('paver_plantas')
    .insert(planta)
    .select()
    .single();
  if (error) throw error;
  return data as PlantaObra;
}

export async function deletePlanta(id: string) {
  const { error } = await supabase.from('paver_plantas').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchFotosLocalizadas(plantaId: string) {
  const { data, error } = await supabase
    .from('paver_fotos_localizadas')
    .select('*')
    .eq('planta_id', plantaId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as FotoLocalizada[];
}

export async function createFotoLocalizada(foto: Omit<FotoLocalizada, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('paver_fotos_localizadas')
    .insert(foto)
    .select()
    .single();
  if (error) throw error;
  return data as FotoLocalizada;
}

export async function deleteFotoLocalizada(id: string) {
  const { error } = await supabase.from('paver_fotos_localizadas').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadFile(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}
