import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, User, Plus, Loader2, Send, Trash2, Edit2, Search, DollarSign, ChevronDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Appointment, Client, Service } from '../lib/types';
import toast from 'react-hot-toast';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addMinutes, parseISO, isWithinInterval } from 'date-fns';
import { useAuthStore } from '../store/authStore';

function Appointments() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('all');
  const [startDate, setStartDate] = useState(new Date());
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [clientFilter, setClientFilter] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    client_id: '',
    service_id: '',
    service: '',
    date: '',
    time: '',
    price: '0.00',
  });

  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const calculateEndTime = (startTime: string, duration: string) => {
    const [hours, minutes] = startTime.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    const endDate = addMinutes(date, parseInt(duration));
    return format(endDate, 'HH:mm');
  };

  const { data: appointments, isLoading: isLoadingAppointments } = useQuery({
    queryKey: ['appointments', user?.id, dateFilter, startDate],
    queryFn: async () => {
      let query = supabase
        .from('appointments')
        .select(`
          *,
          client:clients(*),
          service_details:services(*)
        `)
        .eq('user_id', user?.id);

      if (dateFilter === 'day') {
        query = query.eq('date', format(startDate, 'yyyy-MM-dd'));
      } else if (dateFilter === 'week') {
        query = query
          .gte('date', format(startOfWeek(startDate), 'yyyy-MM-dd'))
          .lte('date', format(endOfWeek(startDate), 'yyyy-MM-dd'));
      } else if (dateFilter === 'month') {
        query = query
          .gte('date', format(startOfMonth(startDate), 'yyyy-MM-dd'))
          .lte('date', format(endOfMonth(startDate), 'yyyy-MM-dd'));
      }

      const { data, error } = await query.order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      return data as (Appointment & { client: Client; service_details: Service })[];
    },
    enabled: !!user?.id,
  });

  const { data: clients } = useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user?.id)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.id,
  });

  const { data: services } = useQuery({
    queryKey: ['services', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('user_id', user?.id)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Service[];
    },
    enabled: !!user?.id,
  });

  // Filter clients based on search
  const filteredClients = clients?.filter(client =>
    client.name.toLowerCase().includes(clientFilter.toLowerCase())
  ) || [];

  const createAppointmentMutation = useMutation({
    mutationFn: async (appointmentData: typeof newAppointment) => {
      const selectedService = services?.find(s => s.id === appointmentData.service_id);
      if (!selectedService) {
        throw new Error('Serviço não encontrado');
      }

      const startTime = parseISO(`${appointmentData.date}T${appointmentData.time}`);
      const duration = parseInt(selectedService.duration);
      const endTime = addMinutes(startTime, duration);

      // Check for overlapping appointments
      const hasOverlap = appointments?.some(appointment => {
        if (appointment.date !== appointmentData.date) return false;
        if (isEditMode && selectedAppointment?.id === appointment.id) return false;

        const existingStart = parseISO(`${appointment.date}T${appointment.time}`);
        const existingService = services?.find(s => s.id === appointment.service_id);
        if (!existingService) return false;

        const existingEnd = addMinutes(existingStart, parseInt(existingService.duration));

        return (
          (startTime >= existingStart && startTime < existingEnd) ||
          (endTime > existingStart && endTime <= existingEnd) ||
          (startTime <= existingStart && endTime >= existingEnd)
        );
      });

      if (hasOverlap) {
        throw new Error('Já existe um agendamento neste horário');
      }

      const { data, error } = await supabase
        .from('appointments')
        .insert([{ 
          ...appointmentData, 
          user_id: user?.id, 
          status: 'pending',
          price: parseFloat(appointmentData.price)
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', user?.id] });
      setIsModalOpen(false);
      setNewAppointment({ client_id: '', service_id: '', service: '', date: '', time: '', price: '0.00' });
      setClientFilter('');
      toast.success('Agendamento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async (appointment: Partial<Appointment> & { id: string }) => {
      const selectedService = services?.find(s => s.id === appointment.service_id);
      if (!selectedService) {
        throw new Error('Serviço não encontrado');
      }

      const startTime = parseISO(`${appointment.date}T${appointment.time}`);
      const duration = parseInt(selectedService.duration);
      const endTime = addMinutes(startTime, duration);

      // Check for overlapping appointments
      const hasOverlap = appointments?.some(existingAppointment => {
        if (existingAppointment.id === appointment.id) return false;
        if (existingAppointment.date !== appointment.date) return false;

        const existingStart = parseISO(`${existingAppointment.date}T${existingAppointment.time}`);
        const existingService = services?.find(s => s.id === existingAppointment.service_id);
        if (!existingService) return false;

        const existingEnd = addMinutes(existingStart, parseInt(existingService.duration));

        return (
          (startTime >= existingStart && startTime < existingEnd) ||
          (endTime > existingStart && endTime <= existingEnd) ||
          (startTime <= existingStart && endTime >= existingEnd)
        );
      });

      if (hasOverlap) {
        throw new Error('Já existe um agendamento neste horário');
      }

      const updateData = {
        ...appointment,
        price: typeof appointment.price === 'string' ? parseFloat(appointment.price) : appointment.price
      };

      const { data, error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointment.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', user?.id] });
      setIsModalOpen(false);
      setSelectedAppointment(null);
      setIsEditMode(false);
      setClientFilter('');
      toast.success('Agendamento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', user?.id] });
      setIsDeleteModalOpen(false);
      setAppointmentToDelete(null);
      toast.success('Agendamento excluído com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao excluir agendamento');
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'confirmation' | 'reminder_24h' | 'reminder_1h' | 'cancellation' }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appointmentId: id,
          type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      return { id, type };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['appointments', user?.id] });
      const messageType = data.type === 'confirmation' ? 'confirmação' : 
                         data.type === 'reminder_24h' ? 'lembrete (24h)' :
                         data.type === 'reminder_1h' ? 'lembrete (1h)' : 'cancelamento';
      toast.success(`Mensagem de ${messageType} enviada com sucesso!`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleEdit = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setNewAppointment({
      client_id: appointment.client_id,
      service_id: appointment.service_id,
      service: appointment.service,
      date: appointment.date,
      time: appointment.time,
      price: appointment.price?.toString() || '0.00',
    });
    setClientFilter(appointment.client?.name || '');
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setAppointmentToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (appointmentToDelete) {
      await deleteAppointmentMutation.mutateAsync(appointmentToDelete);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && selectedAppointment) {
      await updateAppointmentMutation.mutateAsync({
        id: selectedAppointment.id,
        ...newAppointment,
      });
    } else {
      await createAppointmentMutation.mutateAsync(newAppointment);
    }
  };

  const handleSendMessage = async (id: string, type: 'confirmation' | 'reminder_24h' | 'reminder_1h' | 'cancellation') => {
    const appointment = appointments?.find(apt => apt.id === id);
    if (!appointment?.messages_sent?.[type]) {
      await sendMessageMutation.mutateAsync({ id, type });
    } else {
      toast.error('Esta mensagem já foi enviada anteriormente');
    }
  };

  const handleServiceChange = (serviceId: string) => {
    const selectedService = services?.find(s => s.id === serviceId);
    setNewAppointment({
      ...newAppointment,
      service_id: serviceId,
      service: selectedService?.name || '',
      price: selectedService?.price?.toString() || '0.00',
    });
  };

  const handleClientSelect = (clientId: string) => {
    const selectedClient = clients?.find(c => c.id === clientId);
    setNewAppointment({
      ...newAppointment,
      client_id: clientId,
    });
    setClientFilter(selectedClient?.name || '');
    setIsClientDropdownOpen(false);
  };

  if (isLoadingAppointments) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agendamentos</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-[5px] py-[5px]"
                >
                  <option value="all">Todos</option>
                  <option value="day">Hoje</option>
                  <option value="week">Esta Semana</option>
                  <option value="month">Este Mês</option>
                </select>
                <input
                  type="date"
                  value={format(startDate, 'yyyy-MM-dd')}
                  onChange={(e) => setStartDate(new Date(e.target.value))}
                  className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-[5px] py-[5px]"
                />
              </div>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Novo Agendamento
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {appointments?.map((appointment) => (
            <div key={appointment.id} className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <User className="w-10 h-10 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {appointment.client?.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {appointment.service_details?.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <DollarSign className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        R$ {appointment.price?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-8">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(appointment.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {appointment.time} - {calculateEndTime(appointment.time, appointment.service_details?.duration || '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(appointment)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(appointment.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-full"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => handleSendMessage(appointment.id, 'confirmation')}
                  disabled={appointment.messages_sent?.confirmation}
                  className={`px-3 py-1 text-sm rounded-md flex items-center gap-1 ${
                    appointment.messages_sent?.confirmation
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70'
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {appointment.messages_sent?.confirmation ? 'Enviado' : 'Confirmação'}
                </button>
                <button
                  onClick={() => handleSendMessage(appointment.id, 'reminder_24h')}
                  disabled={appointment.messages_sent?.reminder_24h}
                  className={`px-3 py-1 text-sm rounded-md flex items-center gap-1 ${
                    appointment.messages_sent?.reminder_24h
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70'
                      : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {appointment.messages_sent?.reminder_24h ? 'Enviado' : 'Lembrete (24h)'}
                </button>
                <button
                  onClick={() => handleSendMessage(appointment.id, 'reminder_1h')}
                  disabled={appointment.messages_sent?.reminder_1h}
                  className={`px-3 py-1 text-sm rounded-md flex items-center gap-1 ${
                    appointment.messages_sent?.reminder_1h
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70'
                      : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {appointment.messages_sent?.reminder_1h ? 'Enviado' : 'Lembrete (1h)'}
                </button>
                <button
                  onClick={() => handleSendMessage(appointment.id, 'cancellation')}
                  disabled={appointment.messages_sent?.cancellation}
                  className={`px-3 py-1 text-sm rounded-md flex items-center gap-1 ${
                    appointment.messages_sent?.cancellation
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70'
                      : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {appointment.messages_sent?.cancellation ? 'Enviado' : 'Cancelamento'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Appointment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              {isEditMode ? 'Editar Agendamento' : 'Novo Agendamento'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cliente
                  </label>
                  <div className="relative" ref={clientDropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar e selecionar cliente..."
                        value={clientFilter}
                        onChange={(e) => {
                          setClientFilter(e.target.value);
                          setIsClientDropdownOpen(true);
                          if (!e.target.value) {
                            setNewAppointment({ ...newAppointment, client_id: '' });
                          }
                        }}
                        onFocus={() => setIsClientDropdownOpen(true)}
                        className="w-full px-[5px] py-[5px] pl-10 pr-10 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    </div>
                    
                    {isClientDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredClients.length > 0 ? (
                          filteredClients.map((client) => (
                            <div
                              key={client.id}
                              onClick={() => handleClientSelect(client.id)}
                              className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-gray-900 dark:text-white"
                            >
                              <div className="font-medium">{client.name}</div>
                              {client.email && (
                                <div className="text-sm text-gray-500 dark:text-gray-400">{client.email}</div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-2 text-gray-500 dark:text-gray-400">
                            Nenhum cliente encontrado
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Serviço
                  </label>
                  <select
                    required
                    value={newAppointment.service_id}
                    onChange={(e) => handleServiceChange(e.target.value)}
                    className="w-full px-[5px] py-[5px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Selecione um serviço</option>
                    {services?.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} - {service.duration}min - R$ {service.price?.toFixed(2) || '0.00'}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Preço (R$)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newAppointment.price}
                    onChange={(e) =>
                      setNewAppointment({
                        ...newAppointment,
                        price: e.target.value,
                      })
                    }
                    className="w-full px-[5px] py-[5px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    required
                    value={newAppointment.date}
                    onChange={(e) =>
                      setNewAppointment({
                        ...newAppointment,
                        date: e.target.value,
                      })
                    }
                    className="w-full px-[5px] py-[5px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Horário
                  </label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <input
                      type="time"
                      required
                      value={newAppointment.time}
                      onChange={(e) =>
                        setNewAppointment({
                          ...newAppointment,
                          time: e.target.value,
                        })
                      }
                      className="w-full sm:flex-1 px-[5px] py-[5px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    {newAppointment.service_id && newAppointment.time && (
                      <div className="px-[5px] py-[5px] bg-gray-100 dark:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">
                        até {calculateEndTime(newAppointment.time, services?.find(s => s.id === newAppointment.service_id)?.duration || '0')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditMode(false);
                    setSelectedAppointment(null);
                    setClientFilter('');
                    setIsClientDropdownOpen(false);
                  }}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createAppointmentMutation.isPending || updateAppointmentMutation.isPending || !newAppointment.client_id}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {(createAppointmentMutation.isPending || updateAppointmentMutation.isPending) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {isEditMode ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirmar Exclusão
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja excluir este agendamento?
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setAppointmentToDelete(null);
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Appointments;