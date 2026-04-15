import React from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component<any, any> {
  state = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    (this as any).setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
      let isPermissionError = false;

      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message);
          if (parsed.error && (parsed.error.includes('insufficient permissions') || parsed.error.includes('Missing or insufficient permissions'))) {
            errorMessage = "عذراً، ليس لديك الصلاحيات الكافية للقيام بهذا الإجراء. يرجى التواصل مع مدير النظام.";
            isPermissionError = true;
          }
        }
      } catch (e) {
        // Not a JSON error message
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-red-500" size={40} />
            </div>
            
            <h1 className="text-2xl font-black text-gray-900 mb-4">
              {isPermissionError ? "خطأ في الصلاحيات" : "عذراً، حدث خطأ ما"}
            </h1>
            
            <p className="text-gray-500 font-medium mb-8 leading-relaxed">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <RefreshCcw size={18} />
                تحديث الصفحة
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full bg-gray-50 text-gray-600 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-gray-100 transition-all"
              >
                <Home size={18} />
                العودة للرئيسية
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && error && (
              <div className="mt-8 p-4 bg-gray-50 rounded-xl text-left overflow-auto max-h-40">
                <p className="text-[10px] font-mono text-gray-400 mb-2 uppercase">Error Details (Dev Only):</p>
                <pre className="text-[10px] font-mono text-red-400 whitespace-pre-wrap">
                  {error.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
