import { supabase } from '../lib/supabase';

/**
 * Sends a transactional email using the Supabase Edge Function 'send-email'
 * 
 * @param {Object} options
 * @param {'welcome' | 'order_ready'} options.type - The type of email to send
 * @param {string} options.email - The recipient email address
 * @param {Object} [options.data] - Additional data required for the template (e.g. order details)
 */
export const sendEmail = async ({ type, email, data = {} }) => {
  try {
    const { data: responseData, error } = await supabase.functions.invoke('send-email', {
      body: { type, email, data },
    });

    if (error) {
      throw error;
    }

    return responseData;
  } catch (error) {
    console.error('Error sending email:', error);
    // We don't want email failures to block the main flow (like signup or order updates),
    // so we catch and log the error instead of throwing it to the UI.
    return { error };
  }
};
