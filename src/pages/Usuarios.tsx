import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, ShieldOff, Loader2, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchAllUsers, assignRole, removeRole, UserWithRole } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  engenharia: 'Engenharia',
};

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-accent/10 text-accent border-accent/30',
  engenharia: 'bg-blue-500/10 text-blue-700 border-blue-200',
};

export default function Usuarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('engenharia');
  const [creating, setCreating] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchAllUsers,
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, role, has }: { userId: string; role: string; has: boolean }) => {
      if (has) {
        await removeRole(userId, role);
      } else {
        await assignRole(userId, role);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Permissão atualizada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    // Create user via Supabase Auth admin (note: requires service_role for production)
    // For now, we use signUp which works with anon key
    const { data, error } = await supabase.auth.signUp({
      email: newEmail,
      password: newPassword,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      toast({ title: 'Erro ao criar usuário', description: error.message, variant: 'destructive' });
      setCreating(false);
      return;
    }

    if (data.user) {
      try {
        await assignRole(data.user.id, newRole);
      } catch {
        // Role assignment may fail if profile trigger hasn't completed
      }
    }

    toast({ title: 'Usuário criado!', description: 'O usuário receberá um e-mail de confirmação.' });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setDialogOpen(false);
    setNewEmail('');
    setNewPassword('');
    setNewRole('engenharia');
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Usuários</h1>
          <p className="text-muted-foreground font-body">Gerenciamento de usuários e permissões</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Criar Usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label className="font-body">E-mail</Label>
                <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className="font-body" />
              </div>
              <div className="space-y-2">
                <Label className="font-body">Senha</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className="font-body" />
              </div>
              <div className="space-y-2">
                <Label className="font-body">Perfil</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin" className="font-body">Administrador</SelectItem>
                    <SelectItem value="engenharia" className="font-body">Engenharia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="font-body">Cancelar</Button>
                <Button type="submit" disabled={creating} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">Nenhum usuário encontrado</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium font-body">{u.full_name || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground font-body">{u.id.slice(0, 8)}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(['admin', 'engenharia'] as const).map((role) => {
                    const has = u.roles.includes(role);
                    return (
                      <Button
                        key={role}
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs font-body ${has ? roleBadgeColors[role] : 'text-muted-foreground'}`}
                        onClick={() => toggleRoleMutation.mutate({ userId: u.id, role, has })}
                        disabled={toggleRoleMutation.isPending}
                      >
                        {has ? <Shield className="h-3 w-3 mr-1" /> : <ShieldOff className="h-3 w-3 mr-1" />}
                        {roleLabels[role]}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
