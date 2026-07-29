import { supabase } from '../lib/supabase'

export const sendWhatsApp = async ({ organizationId, phone, message, fromNumber }) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { type: 'send_whatsapp', data: { organization_id: organizationId, phone, message, from_number: fromNumber } },
    })
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error sending WhatsApp:', error)
    return { error }
  }
}
