# Cambios V0.8.6

- Se corrigió la causa estructural del teletransporte del avatar: `avatarAnchor` ahora representa siempre la esquina superior izquierda del avatar visible (78x78), nunca la esquina de la ventana Electron (90x90).
- Toda la física, arrastre, guardado y corrección de límites convierten explícitamente entre la posición del avatar y la posición de la ventana.
- Abrir y cerrar el menú ya no lee la posición desde la ventana ni la sobrescribe.
- El menú se posiciona alrededor de `avatarAnchor` y puede moverse para entrar en el área de trabajo sin modificar el avatar.
- Los límites usan el tamaño visual real del avatar (78x78), por lo que el avatar puede ocupar correctamente toda el área de trabajo disponible.
- La posición guardada usa formato v2 con la esquina superior izquierda del avatar visible. Se mantiene migración compatible con posiciones antiguas guardadas como centro.
- El límite inferior sigue usando `workArea` de Windows, por encima de la barra de tareas.
- La posición por defecto se mantiene en la esquina inferior derecha del área de trabajo.
