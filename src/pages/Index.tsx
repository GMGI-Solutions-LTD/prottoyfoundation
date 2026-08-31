import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, TrendingUp, TrendingDown, Wallet } from "lucide-react";

interface Fund {
  id: string;
  name: string;
}

interface Txn {
  fund_id: string;
  amount: number;
  date: string; // ISO date
}

interface FundSummary {
  id: string;
  name: string;
  income: number;
  expense: number;
  balance: number;
}

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);

const ALL = "all";

const monthKey = (d: string) => d.slice(0, 7); // YYYY-MM

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

export default function Index() {
  const { user, isAdmin } = useAuth();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [incomes, setIncomes] = useState<Txn[]>([]);
  const [expenses, setExpenses] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string>(ALL);

  useEffect(() => {
    const load = async () => {
      const [{ data: fundsData }, { data: txns }, { data: exps }] = await Promise.all([
        supabase.from("funds").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("transactions").select("fund_id, amount, txn_date"),
        supabase.from("expenses").select("fund_id, amount, expense_date"),
      ]);

      setFunds((fundsData ?? []).map((f) => ({ id: f.id, name: f.name })));
      setIncomes((txns ?? []).map((t) => ({ fund_id: t.fund_id, amount: Number(t.amount), date: t.txn_date })));
      setExpenses((exps ?? []).map((e) => ({ fund_id: e.fund_id, amount: Number(e.amount), date: e.expense_date })));
      setLoading(false);
    };
    load();
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    incomes.forEach((t) => set.add(monthKey(t.date)));
    expenses.forEach((t) => set.add(monthKey(t.date)));
    return Array.from(set).sort().reverse();
  }, [incomes, expenses]);

  const summaries: FundSummary[] = useMemo(() => {
    const filterFn = (t: Txn) => month === ALL || monthKey(t.date) === month;
    const incomeMap = new Map<string, number>();
    incomes.filter(filterFn).forEach((t) => {
      incomeMap.set(t.fund_id, (incomeMap.get(t.fund_id) ?? 0) + t.amount);
    });
    const expenseMap = new Map<string, number>();
    expenses.filter(filterFn).forEach((t) => {
      expenseMap.set(t.fund_id, (expenseMap.get(t.fund_id) ?? 0) + t.amount);
    });
    return funds.map((f) => {
      const income = incomeMap.get(f.id) ?? 0;
      const expense = expenseMap.get(f.id) ?? 0;
      return { id: f.id, name: f.name, income, expense, balance: income - expense };
    });
  }, [funds, incomes, expenses, month]);

  const totals = summaries.reduce(
    (acc, s) => ({
      income: acc.income + s.income,
      expense: acc.expense + s.expense,
      balance: acc.balance + s.balance,
    }),
    { income: 0, expense: 0, balance: 0 }
  );

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}.
            {!isAdmin && " (Awaiting admin role)"}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="month-filter" className="text-xs text-muted-foreground">Filter by month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="month-filter" className="w-[220px]">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All time</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">৳ {formatBDT(totals.income)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expense</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">৳ {formatBDT(totals.expense)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">৳ {formatBDT(totals.balance)}</div>
              </CardContent>
            </Card>
          </div>

          <h3 className="mb-3 text-lg font-semibold">
            Fund Balances {month !== ALL && <span className="text-sm font-normal text-muted-foreground">— {monthLabel(month)}</span>}
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Income</span>
                    <span>৳ {formatBDT(s.income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expense</span>
                    <span>৳ {formatBDT(s.expense)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Balance</span>
                    <span>৳ {formatBDT(s.balance)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
