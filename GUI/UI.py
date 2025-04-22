import streamlit as st

# Título de la aplicación
st.markdown("""
    <style>
    /* Aseguramos que todo el cuerpo de la página se ajuste */
    html, body {
        margin: 0;
        padding: 0;
        width: 100%;
    }

    /* Estilo del banner */
    .banner {
        background-color: #A5D7D2;
        color: black;
        text-align: center;
        padding: 20px;
        font-size: 24px;
        font-weight: bold;
        width: 100%;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
    }
    .separator-banner {
        height: 10px;
        background-color: #A5D7D2
        width: 100%;
        position: fixed;
    }
    #MainMenu {visibility: hidden;}
    header {visibility: hidden;}
    footer {visibility: hidden;}        
    </style>
    <div class="banner">
        <h1>DeepPatella</h1>
        <p>Automatic quantification of patellar tendon stiffness</p>
    </div>
""", unsafe_allow_html=True)

col1, col2 = st.columns([2, 3])

with col1:
    st.header('Configurations')

st.markdown('<div class="separator"></div>', unsafe_allow_html=True)
