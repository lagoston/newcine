import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Library as LibraryIcon, Eye, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Logo from '../components/Logo';

const Home = () => {
  const { session } = useAuth();
  const { t } = useTranslation();

  if (session) {
    window.location.href = '/library';
    return null;
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundImage: 'url(/assets/Fundo.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay escuro para melhorar legibilidade */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e27]/80 via-[#0a0e27]/70 to-[#0a0e27]/80"></div>

      {/* Efeito de brilho no logo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-blue-500/20 via-purple-500/10 to-transparent blur-3xl"></div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        {/* Logo Central Animado */}
        <motion.div
          className="mb-12"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.div
            className="relative"
            animate={{
              filter: [
                'drop-shadow(0 0 20px rgba(236, 72, 153, 0.8)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.6))',
                'drop-shadow(0 0 30px rgba(139, 92, 246, 0.8)) drop-shadow(0 0 50px rgba(236, 72, 153, 0.6))',
                'drop-shadow(0 0 20px rgba(236, 72, 153, 0.8)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.6))',
              ]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Logo size="large" className="w-32 h-32" />
          </motion.div>
        </motion.div>

        {/* Título Principal */}
        <motion.div
          className="text-center mb-6"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-4">
            <span className="text-white">Bem-vindo ao </span>
            <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              CineOracle
            </span>
          </h1>
        </motion.div>

        {/* Subtítulo */}
        <motion.p
          className="text-gray-300 text-lg sm:text-xl text-center max-w-2xl mb-16 px-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          Seu companheiro pessoal de cinema. Descubra, avalie e construa sua
          <br />
          coleção definitiva de filmes.
        </motion.p>

        {/* Cards de Funcionalidades */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full px-4 mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          {[
            {
              icon: <Star className="w-12 h-12 text-yellow-400 mb-4" />,
              title: 'Classificação',
              description: 'Avalie filmes e receba estatísticas personalizadas',
              gradient: 'from-yellow-500/20 to-orange-500/20',
              borderGradient: 'from-yellow-500/50 to-orange-500/50'
            },
            {
              icon: <LibraryIcon className="w-12 h-12 text-blue-400 mb-4" />,
              title: 'Sua Biblioteca',
              description: 'Visualize e gerencie sua coleção de filmes e séries',
              gradient: 'from-blue-500/20 to-cyan-500/20',
              borderGradient: 'from-blue-500/50 to-cyan-500/50'
            },
            {
              icon: <Eye className="w-12 h-12 text-purple-400 mb-4" />,
              title: 'Câmara de Previsão',
              description: 'Obtenha previsões e recomendações personalizadas',
              gradient: 'from-purple-500/20 to-pink-500/20',
              borderGradient: 'from-purple-500/50 to-pink-500/50'
            },
            {
              icon: <Users className="w-12 h-12 text-green-400 mb-4" />,
              title: 'Comunidade',
              description: 'Siga amigos e crie um perfil único',
              gradient: 'from-green-500/20 to-emerald-500/20',
              borderGradient: 'from-green-500/50 to-emerald-500/50'
            }
          ].map((feature, index) => (
            <motion.div
              key={index}
              className="relative group"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 + (index * 0.1), duration: 0.5 }}
              whileHover={{ y: -8, scale: 1.02 }}
            >
              {/* Card com borda gradiente */}
              <div className="absolute inset-0 bg-gradient-to-br rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"
                style={{
                  background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
                  backgroundImage: `linear-gradient(135deg, ${feature.borderGradient.split(' ')[1]}, ${feature.borderGradient.split(' ')[2]})`
                }}
              ></div>

              <div className={`relative bg-gradient-to-br ${feature.gradient} backdrop-blur-xl rounded-2xl p-8 border border-white/10 h-full transition-all duration-300 group-hover:border-white/20`}>
                <div className="flex flex-col items-center text-center">
                  {feature.icon}
                  <h3 className="text-xl font-bold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Botão Cadastrar */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          <Link
            to="/auth"
            className="group relative inline-flex items-center justify-center gap-3 px-12 py-5 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white text-lg font-bold rounded-full overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
          >
            <span className="relative z-10">Cadastrar</span>
            <Logo className="relative z-10 w-6 h-6 transition-transform duration-300 group-hover:rotate-12" />

            {/* Efeito de brilho animado */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          </Link>
        </motion.div>

        {/* Link para login */}
        <motion.p
          className="mt-6 text-gray-400 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.5 }}
        >
          Já tem uma conta?{' '}
          <Link to="/auth" className="text-purple-400 hover:text-purple-300 font-semibold underline transition-colors">
            Entrar
          </Link>
        </motion.p>
      </div>
    </div>
  );
};

export default Home;
