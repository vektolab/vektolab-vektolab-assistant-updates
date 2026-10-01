# Vekto v0.6.8

- El avatar de Vekto y el panel ahora son ventanas independientes.
- El avatar permanece siempre en su posición y no se mueve al abrir/cerrar el panel.
- El panel desaparece al hacer clic fuera, mientras el avatar permanece visible.
- Al volver desde un generador, el avatar permanece exactamente donde lo dejó el usuario.
- Se agregó bloqueo de instancia: solo puede existir una instancia de Vekto por usuario.
- Si se intenta abrir Vekto otra vez, se enfoca la instancia existente.
- El panel se posiciona respecto del avatar sin moverlo y elige arriba o abajo según el espacio disponible.
- El panel y el visor de generadores tienen márgenes transparentes para conservar las esquinas redondeadas y evitar recortes.
- El avatar usa su propia ventana de 90x90, por lo que la física puede recorrer toda el área de trabajo real.
- Se mantiene el lanzamiento con gravedad, amortiguación y hasta 5 choques.
- Mientras se arrastra, el avatar mantiene el balanceo y muestra un rebote visual al tocar los bordes.
