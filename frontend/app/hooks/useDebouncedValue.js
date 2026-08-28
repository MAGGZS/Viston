'use client';
import { useEffect, useState } from 'react';

/**
 * O valor de um campo depois que a pessoa parou de digitar.
 *
 * A barra de procura do histórico busca no servidor. Sem esta espera, "Carlos"
 * são seis consultas — cinco delas já obsoletas quando a resposta chega — e a
 * lista pisca a cada tecla enquanto o dedo ainda está no ar.
 *
 * 300ms é o intervalo entre teclas de quem digita depressa: mais curto e as
 * consultas voltam a se empilhar; mais longo e a lista parece ter travado.
 */
export function useDebouncedValue(value, delay = 300) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    // A limpeza cancela o disparo anterior: é o que faz a espera recomeçar a
    // cada tecla em vez de se acumular.
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
