/**
 * Enterprise Billing Service — Renderer-side Supabase integration
 *
 * Handles direct Supabase inserts for enterprise inquiries and orders.
 * The renderer has auth context to use Supabase RLS directly.
 */

import { getSupabaseClient } from '../../auth/supabaseClient';

export interface EnterpriseInquiry {
  name: string;
  email: string;
  company: string;
  phone: string;
  seatsNeeded: number;
  message?: string;
}

export interface EnterpriseOrder {
  inquiryId?: string;
  seatsCount: number;
  spendingLimitPerUserCents: number;
  startingBalanceCents: number;
}

class EnterpriseBillingService {
  /**
   * Submit an enterprise inquiry to Supabase.
   * Inserts into enterprise_inquiries table.
   */
  async submitInquiry(inquiry: EnterpriseInquiry): Promise<{ id: string } | null> {
    try {
      const supabase = await getSupabaseClient();

      const { data, error } = await supabase
        .from('enterprise_inquiries')
        .insert([
          {
            name: inquiry.name,
            email: inquiry.email,
            company: inquiry.company,
            phone: inquiry.phone,
            seats_needed: inquiry.seatsNeeded,
            message: inquiry.message,
            status: 'pending',
          },
        ])
        .select('id')
        .single();

      if (error) {
        console.error('Failed to submit enterprise inquiry:', error);
        return null;
      }

      return { id: data.id };
    } catch (error) {
      console.error('Enterprise inquiry submission error:', error);
      return null;
    }
  }

  /**
   * Create an enterprise order in Supabase.
   * Inserts into enterprise_orders table.
   */
  async createOrder(userId: string, order: EnterpriseOrder): Promise<{ id: string; totalDueCents: number; invoiceNumber: string } | null> {
    try {
      const supabase = await getSupabaseClient();

      // Calculate pricing
      const seatsAnnualCostCents = order.seatsCount * 20 * 12 * 100;
      const totalDueCents = seatsAnnualCostCents + order.startingBalanceCents;
      const invoiceNumber = `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      const { data, error } = await supabase
        .from('enterprise_orders')
        .insert([
          {
            user_id: userId,
            inquiry_id: order.inquiryId,
            seats_count: order.seatsCount,
            spending_limit_per_user_cents: order.spendingLimitPerUserCents,
            starting_balance_cents: order.startingBalanceCents,
            seats_annual_cost_cents: seatsAnnualCostCents,
            total_due_cents: totalDueCents,
            invoice_number: invoiceNumber,
            status: 'pending',
            payment_status: 'unpaid',
          },
        ])
        .select('id')
        .single();

      if (error) {
        console.error('Failed to create enterprise order:', error);
        return null;
      }

      return {
        id: data.id,
        totalDueCents,
        invoiceNumber,
      };
    } catch (error) {
      console.error('Enterprise order creation error:', error);
      return null;
    }
  }

  /**
   * Get inquiry details from Supabase.
   */
  async getInquiry(inquiryId: string) {
    try {
      const supabase = await getSupabaseClient();

      const { data, error } = await supabase
        .from('enterprise_inquiries')
        .select('*')
        .eq('id', inquiryId)
        .single();

      if (error) {
        console.error('Failed to fetch inquiry:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Inquiry fetch error:', error);
      return null;
    }
  }

  /**
   * Get order details from Supabase.
   */
  async getOrder(orderId: string) {
    try {
      const supabase = await getSupabaseClient();

      const { data, error } = await supabase
        .from('enterprise_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error) {
        console.error('Failed to fetch order:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Order fetch error:', error);
      return null;
    }
  }
}

export const enterpriseBillingService = new EnterpriseBillingService();
