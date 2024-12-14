# handlers/client_handler.py

import select

class ClientHandler:
    def __init__(self, server, client_socket, addr):
        self.server = server
        self.client_socket = client_socket
        self.addr = addr

    def handle(self):
        print(f"New connection from {self.addr}")
        while self.server.running:
            try:
                readable, _, _ = select.select([self.client_socket], [], [], 1.0)
                if readable:
                    data = self.client_socket.recv(1024)
                    if not data:
                        break
                    message = data.decode()
                    print(f"Received from {self.addr}: {message}")
                    if message.lower() == "exit":
                        print(f"Closing connection with {self.addr}...")
                        break
                    # Broadcast the message to all other clients
                    self.server.broadcast(f"{self.addr}: {message}", sender=self)
            except Exception as e:
                print(f"An error occurred with {self.addr}: {e}")
                break
        self.close()

    def send(self, message):
        try:
            self.client_socket.send(message.encode())
        except Exception as e:
            print(f"Error sending to {self.addr}: {e}")

    def close(self):
        self.client_socket.close()
        self.server.remove_client(self)
        print(f"Connection with {self.addr} closed.")